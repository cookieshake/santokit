package api

import (
	"encoding/json"
	"net/http"

	"github.com/cookieshake/santoki/packages/hub/internal/config"
	"github.com/cookieshake/santoki/packages/hub/internal/registry"
	"github.com/cookieshake/santoki/packages/hub/internal/vault"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// API holds the service dependencies
type API struct {
	config   *config.Config
	registry *registry.Service
	vault    *vault.Service
}

// NewRouter creates the main API router
func NewRouter(cfg *config.Config, reg *registry.Service, vlt *vault.Service) http.Handler {
	api := &API{
		config:   cfg,
		registry: reg,
		vault:    vlt,
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
	w.WriteHeader(http.StatusNotImplemented)
}

func (a *API) handleCreateToken(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotImplemented)
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

	// TODO: Get user ID from context
	userID := "user_1"

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
	w.WriteHeader(http.StatusNotImplemented)
}

func (a *API) handleSchemaApply(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotImplemented)
}

func (a *API) handleListProjects(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotImplemented)
}

func (a *API) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotImplemented)
}

func (a *API) handleGetProject(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotImplemented)
}

func (a *API) authMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// TODO: Implement JWT/PAT validation
			// For now, allow all
			next.ServeHTTP(w, r)
		})
	}
}
