package api

import (
	"net/http"

	"github.com/cookieshake/santoki/packages/hub/internal/config"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter creates the main API router
func NewRouter(cfg *config.Config) http.Handler {
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
			r.Post("/login", handleLogin)
			r.Post("/token", handleCreateToken)
		})

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware(cfg))

			// Manifest Registry
			r.Route("/manifest", func(r chi.Router) {
				r.Get("/", handleGetManifest)
				r.Post("/", handlePushManifest)
			})

			// Secrets Vault
			r.Route("/secrets", func(r chi.Router) {
				r.Get("/", handleListSecrets)
				r.Post("/", handleSetSecret)
				r.Delete("/{key}", handleDeleteSecret)
			})

			// Schema Engine
			r.Route("/schema", func(r chi.Router) {
				r.Post("/plan", handleSchemaPlan)
				r.Post("/apply", handleSchemaApply)
			})

			// Projects
			r.Route("/projects", func(r chi.Router) {
				r.Get("/", handleListProjects)
				r.Post("/", handleCreateProject)
				r.Get("/{id}", handleGetProject)
			})
		})
	})

	return r
}

// Placeholder handlers - to be implemented

func handleLogin(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement OAuth flow
	w.WriteHeader(http.StatusNotImplemented)
}

func handleCreateToken(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement PAT creation
	w.WriteHeader(http.StatusNotImplemented)
}

func handleGetManifest(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement manifest retrieval
	w.WriteHeader(http.StatusNotImplemented)
}

func handlePushManifest(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement manifest push
	w.WriteHeader(http.StatusNotImplemented)
}

func handleListSecrets(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement secrets listing
	w.WriteHeader(http.StatusNotImplemented)
}

func handleSetSecret(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement secret storage
	w.WriteHeader(http.StatusNotImplemented)
}

func handleDeleteSecret(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement secret deletion
	w.WriteHeader(http.StatusNotImplemented)
}

func handleSchemaPlan(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement schema planning via Atlas
	w.WriteHeader(http.StatusNotImplemented)
}

func handleSchemaApply(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement schema migration via Atlas
	w.WriteHeader(http.StatusNotImplemented)
}

func handleListProjects(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement project listing
	w.WriteHeader(http.StatusNotImplemented)
}

func handleCreateProject(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement project creation
	w.WriteHeader(http.StatusNotImplemented)
}

func handleGetProject(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement project retrieval
	w.WriteHeader(http.StatusNotImplemented)
}

func authMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// TODO: Implement JWT/PAT validation
			next.ServeHTTP(w, r)
		})
	}
}
