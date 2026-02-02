package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cookieshake/santokit/packages/hub/api"
	"github.com/cookieshake/santokit/packages/hub/internal/config"
	"github.com/cookieshake/santokit/packages/hub/internal/projectconfig"
	"github.com/cookieshake/santokit/packages/hub/internal/projects"
	"github.com/cookieshake/santokit/packages/hub/internal/registry"
	"github.com/cookieshake/santokit/packages/hub/internal/schema"
	"github.com/cookieshake/santokit/packages/hub/internal/store/sqlstore"
	"github.com/cookieshake/santokit/packages/hub/internal/vault"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize repositories (SQL-backed)
	db, dialect, err := sqlstore.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	regRepo := sqlstore.NewRegistryRepository(db, dialect)
	vaultRepo := sqlstore.NewVaultRepository(db, dialect)
	projectConfigRepo := sqlstore.NewProjectConfigRepository(db, dialect)

	// Initialize services
	regService := registry.NewService(regRepo)
	projectConfigService := projectconfig.NewServiceWithRepository(projectConfigRepo)
	projectService := projects.NewServiceWithDB(db, dialect)
	vaultService, err := vault.NewService(vaultRepo, cfg.EncryptionKey)
	if err != nil {
		log.Fatalf("Failed to initialize vault service: %v", err)
	}
	schemaService := schema.NewService(cfg.AtlasURL, vaultService)

	// Initialize API router
	router := api.NewRouter(cfg, regService, schemaService, projectConfigService, projectService, vaultService)

	server := &http.Server{
		Addr:         cfg.ServerAddr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}
	}()

	log.Printf("Santokit Hub starting on %s", cfg.ServerAddr)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
