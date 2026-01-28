package config
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
























}	return defaultValue	}		return value	if value := os.Getenv(key); value != "" {func getEnv(key, defaultValue string) string {}	return cfg, nil		}		EdgeKVToken:   getEnv("STK_EDGE_KV_TOKEN", ""),		EdgeKVURL:     getEnv("STK_EDGE_KV_URL", ""),		AtlasURL:      getEnv("STK_ATLAS_URL", ""),		EncryptionKey: getEnv("STK_ENCRYPTION_KEY", "32-byte-key-for-aes-256-gcm!!!"), // Must be 32 bytes		JWTSecret:     getEnv("STK_JWT_SECRET", "change-me-in-production"),		DatabaseURL:   getEnv("STK_DATABASE_URL", "postgres://localhost:5432/santoki?sslmode=disable"),		ServerAddr:    getEnv("STK_HUB_ADDR", ":8080"),	cfg := &Config{func Load() (*Config, error) {// Load loads configuration from environment variables}	EdgeKVToken string