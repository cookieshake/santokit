package config

import (
	"os"
)

// Config holds all configuration for the Hub
type Config struct {
	// Server
	ServerAddr string

	// Database
	DatabaseURL string

	// Security
	JWTSecret     string
	EncryptionKey string // 32 bytes for AES-256

	// Atlas (Schema Engine)
	AtlasURL string

	// Edge Provisioning
	EdgeKVURL   string
	EdgeKVToken string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	cfg := &Config{
		ServerAddr:    getEnv("STK_HUB_ADDR", ":8080"),
		DatabaseURL:   getEnv("STK_DATABASE_URL", "postgres://localhost:5432/santoki?sslmode=disable"),
		JWTSecret:     getEnv("STK_JWT_SECRET", "change-me-in-production"),
		EncryptionKey: getEnv("STK_ENCRYPTION_KEY", "32-byte-key-for-aes-256-gcm!!!"), // Must be 32 bytes
		AtlasURL:      getEnv("STK_ATLAS_URL", ""),
		EdgeKVURL:     getEnv("STK_EDGE_KV_URL", ""),
		EdgeKVToken:   getEnv("STK_EDGE_KV_TOKEN", ""),
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
