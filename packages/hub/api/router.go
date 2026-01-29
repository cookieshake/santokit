package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/cookieshake/santokit/packages/hub/internal/config"
	"github.com/cookieshake/santokit/packages/hub/internal/projectconfig"
	"github.com/cookieshake/santokit/packages/hub/internal/projects"
	"github.com/cookieshake/santokit/packages/hub/internal/registry"
	"github.com/cookieshake/santokit/packages/hub/internal/schema"
	"github.com/cookieshake/santokit/packages/hub/internal/vault"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// API holds the service dependencies
type API struct {
	config        *config.Config
	projectConfig *projectconfig.Service
	projects      *projects.Service
	registry      *registry.Service
	schema        *schema.Service
	vault         *vault.Service
}

// NewRouter creates the main API router
func NewRouter(cfg *config.Config, reg *registry.Service, schemaSvc *schema.Service, projCfg *projectconfig.Service, projSvc *projects.Service, vlt *vault.Service) http.Handler {
	api := &API{
		config:        cfg,
		projectConfig: projCfg,
		projects:      projSvc,
		registry:      reg,
		schema:        schemaSvc,
		vault:         vlt,
	}

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("OK"))
	})

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		// Auth routes
		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", api.handleLogin)
			r.Post("/token", api.handleCreateToken)
		})

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(api.authMiddleware())

			// Manifest Registry
			r.Route("/manifest", func(r chi.Router) {
				r.Get("/", api.handleGetManifest)
				r.Post("/", api.handlePushManifest)
			})

			// Secrets Vault
			r.Route("/secrets", func(r chi.Router) {
				r.Get("/", api.handleListSecrets)
				r.Post("/", api.handleSetSecret)
				r.Delete("/{key}", api.handleDeleteSecret)
			})

			// Schema Engine
			r.Route("/schema", func(r chi.Router) {
				r.Post("/plan", api.handleSchemaPlan)
				r.Post("/apply", api.handleSchemaApply)
			})

			// Project Config
			r.Route("/config", func(r chi.Router) {
				r.Post("/apply", api.handleConfigApply)
				r.Get("/", api.handleConfigGet)
			})

			// Projects
			r.Route("/projects", func(r chi.Router) {
				r.Get("/", api.handleListProjects)
				r.Post("/", api.handleCreateProject)
				r.Get("/{id}", api.handleGetProject)
			})
		})
	})

	return r
}

func (a *API) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"`
		Email  string `json:"email"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID := strings.TrimSpace(req.UserID)
	if userID == "" && strings.TrimSpace(req.Email) != "" {
		userID = strings.TrimSpace(req.Email)
	}
	if userID == "" {
		userID = "local"
	}

	token, exp, err := a.issueToken(userID, req.Email, "login", 24*time.Hour)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := map[string]interface{}{
		"user_id":    userID,
		"email":      req.Email,
		"token":      token,
		"expires_at": exp,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (a *API) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID    string `json:"user_id"`
		Email     string `json:"email"`
		ExpiresIn int64  `json:"expires_in"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID := strings.TrimSpace(req.UserID)
	if userID == "" {
		if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
			if id, ok := a.parseUserIDFromToken(authHeader[7:]); ok {
				userID = id
			}
		}
	}
	if userID == "" && strings.TrimSpace(req.Email) != "" {
		userID = strings.TrimSpace(req.Email)
	}
	if userID == "" {
		http.Error(w, "user_id required", http.StatusBadRequest)
		return
	}

	ttl := 30 * 24 * time.Hour
	if req.ExpiresIn > 0 {
		ttl = time.Duration(req.ExpiresIn) * time.Second
	}

	token, exp, err := a.issueToken(userID, req.Email, "pat", ttl)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := map[string]interface{}{
		"user_id":    userID,
		"email":      req.Email,
		"token":      token,
		"expires_at": exp,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (a *API) handleGetManifest(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		http.Error(w, "project_id required", http.StatusBadRequest)
		return
	}

	manifest, err := a.registry.GetLatest(r.Context(), projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(manifest)
}

func (a *API) handlePushManifest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string            `json:"project_id"`
		Bundles   []registry.Bundle `json:"bundles"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID := userIDFromContext(r.Context())
	if userID == "" {
		userID = "local"
	}

	manifest, err := a.registry.Push(r.Context(), req.ProjectID, req.Bundles, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(manifest)
}

func (a *API) handleListSecrets(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		http.Error(w, "project_id required", http.StatusBadRequest)
		return
	}

	keys, err := a.vault.List(r.Context(), projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

func (a *API) handleSetSecret(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `json:"project_id"`
		Key       string `json:"key"`
		Value     string `json:"value"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := a.vault.Set(r.Context(), req.ProjectID, req.Key, req.Value); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (a *API) handleDeleteSecret(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	key := chi.URLParam(r, "key")

	if err := a.vault.Delete(r.Context(), projectID, key); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (a *API) handleSchemaPlan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string            `json:"project_id"`
		Schemas   map[string]string `json:"schemas"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	projectID := req.ProjectID
	if projectID == "" {
		projectID = r.Header.Get("X-Project-ID")
	}
	if projectID == "" {
		http.Error(w, "project_id required", http.StatusBadRequest)
		return
	}

	if len(req.Schemas) == 0 {
		http.Error(w, "schemas required", http.StatusBadRequest)
		return
	}

	for alias, hcl := range req.Schemas {
		if strings.TrimSpace(alias) == "" {
			http.Error(w, "schema alias required", http.StatusBadRequest)
			return
		}
		if err := a.schema.Validate(r.Context(), hcl); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	result, err := a.schema.Plan(r.Context(), projectID, req.Schemas)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (a *API) handleSchemaApply(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID  string             `json:"project_id"`
		Migrations []schema.Migration `json:"migrations"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	projectID := req.ProjectID
	if projectID == "" {
		projectID = r.Header.Get("X-Project-ID")
	}
	if projectID == "" {
		http.Error(w, "project_id required", http.StatusBadRequest)
		return
	}

	if err := a.schema.Apply(r.Context(), projectID, req.Migrations); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (a *API) handleConfigApply(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProjectID string `json:"project_id"`
		Configs   struct {
			Databases string `json:"databases"`
			Auth      string `json:"auth"`
			Storage   string `json:"storage"`
		} `json:"configs"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	projectID := req.ProjectID
	if projectID == "" {
		projectID = r.Header.Get("X-Project-ID")
	}
	if projectID == "" {
		http.Error(w, "project_id required", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Configs.Databases) == "" &&
		strings.TrimSpace(req.Configs.Auth) == "" &&
		strings.TrimSpace(req.Configs.Storage) == "" {
		http.Error(w, "configs required", http.StatusBadRequest)
		return
	}

	if err := a.projectConfig.Set(r.Context(), projectID, projectconfig.Config{
		Databases: req.Configs.Databases,
		Auth:      req.Configs.Auth,
		Storage:   req.Configs.Storage,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (a *API) handleConfigGet(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("project_id")
	if projectID == "" {
		projectID = r.Header.Get("X-Project-ID")
	}
	if projectID == "" {
		http.Error(w, "project_id required", http.StatusBadRequest)
		return
	}

	cfg, err := a.projectConfig.Get(r.Context(), projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (a *API) handleListProjects(w http.ResponseWriter, r *http.Request) {
	if a.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	userID := userIDFromContext(r.Context())
	teamID := strings.TrimSpace(r.URL.Query().Get("team_id"))
	projectsList, err := a.projects.ListProjects(r.Context(), userID, teamID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(projectsList)
}

func (a *API) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	if a.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		TeamID      string `json:"team_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID := userIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "user_id required", http.StatusUnauthorized)
		return
	}

	project, err := a.projects.CreateProject(r.Context(), userID, req.Name, req.Description, req.TeamID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(project)
}

func (a *API) handleGetProject(w http.ResponseWriter, r *http.Request) {
	if a.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	projectID := chi.URLParam(r, "id")
	if strings.TrimSpace(projectID) == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	project, err := a.projects.GetProject(r.Context(), projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(project)
}

func (a *API) authMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mode := strings.ToLower(os.Getenv("STK_AUTH_MODE"))
			if mode == "" || mode == "local" || os.Getenv("STK_DISABLE_AUTH") == "true" {
				userID := "local"
				if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
					if id, ok := a.parseUserIDFromToken(authHeader[7:]); ok {
						userID = id
					}
				}
				next.ServeHTTP(w, r.WithContext(withUserID(r.Context(), userID)))
				return
			}

			authHeader := r.Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, "missing bearer token", http.StatusUnauthorized)
				return
			}

			userID, ok := a.parseUserIDFromToken(authHeader[7:])
			if !ok || userID == "" {
				http.Error(w, "invalid token", http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r.WithContext(withUserID(r.Context(), userID)))
		})
	}
}

type contextKey string

const userIDKey contextKey = "userID"

func withUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userIDKey, userID)
}

func userIDFromContext(ctx context.Context) string {
	if value, ok := ctx.Value(userIDKey).(string); ok {
		return value
	}
	return ""
}

func parseUserIDFromToken(token string) (string, bool) {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return "", false
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", false
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return "", false
	}

	if sub, ok := payload["sub"].(string); ok && sub != "" {
		return sub, true
	}
	if id, ok := payload["id"].(string); ok && id != "" {
		return id, true
	}

	return "", false
}

func (a *API) parseUserIDFromToken(token string) (string, bool) {
	userID, ok := parseUserIDFromToken(token)
	if !ok || userID == "" {
		return "", false
	}

	if !a.verifyToken(token) {
		return "", false
	}

	return userID, true
}

func (a *API) issueToken(userID, email, tokenType string, ttl time.Duration) (string, time.Time, error) {
	if strings.TrimSpace(userID) == "" {
		return "", time.Time{}, fmt.Errorf("user_id required")
	}

	now := time.Now()
	exp := now.Add(ttl)
	header := map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	}
	payload := map[string]interface{}{
		"sub": userID,
		"iat": now.Unix(),
		"exp": exp.Unix(),
		"typ": tokenType,
	}
	if strings.TrimSpace(email) != "" {
		payload["email"] = email
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", time.Time{}, err
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", time.Time{}, err
	}

	encodedHeader := base64.RawURLEncoding.EncodeToString(headerJSON)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadJSON)
	signingInput := encodedHeader + "." + encodedPayload

	signature := a.signToken(signingInput)
	token := signingInput + "." + signature
	return token, exp, nil
}

func (a *API) signToken(input string) string {
	mac := hmac.New(sha256.New, []byte(a.config.JWTSecret))
	mac.Write([]byte(input))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (a *API) verifyToken(token string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}

	signingInput := parts[0] + "." + parts[1]
	expected := a.signToken(signingInput)
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return false
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return false
	}

	if expRaw, ok := payload["exp"]; ok {
		switch exp := expRaw.(type) {
		case float64:
			if time.Now().Unix() > int64(exp) {
				return false
			}
		case int64:
			if time.Now().Unix() > exp {
				return false
			}
		}
	}

	return true
}
