// Package registry handles manifest storage and versioning.
// It provides version control for logic and schema deployments.
package registry

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/redis/go-redis/v9"
)

// Manifest represents a project manifest
type Manifest struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	Version   string    `json:"version"`
	Bundles   []Bundle  `json:"bundles"`
	CreatedAt time.Time `json:"created_at"`
	CreatedBy string    `json:"created_by"`
}

// Bundle represents a deployable unit within a manifest
type Bundle struct {
	Type      string `json:"type"`      // "logic" or "schema"
	Namespace string `json:"namespace"` // e.g., "users", "orders"
	Name      string `json:"name"`      // e.g., "get", "create"
	Hash      string `json:"hash"`      // Content hash for deduplication
	Content   []byte `json:"content"`   // Encrypted content
	// We add Config for the server
	Config    map[string]interface{} `json:"config,omitempty"`
}

// Repository defines the manifest storage interface
type Repository interface {
	// GetLatest retrieves the latest manifest for a project
	GetLatest(ctx context.Context, projectID string) (*Manifest, error)

	// GetByVersion retrieves a specific manifest version
	GetByVersion(ctx context.Context, projectID, version string) (*Manifest, error)

	// Save stores a new manifest
	Save(ctx context.Context, manifest *Manifest) error

	// ListVersions lists all manifest versions for a project
	ListVersions(ctx context.Context, projectID string) ([]string, error)
}

// Service provides manifest registry operations
type Service struct {
	repo Repository
}

// NewService creates a new registry service
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Push stores a new manifest and returns the assigned version
func (s *Service) Push(ctx context.Context, projectID string, bundles []Bundle, userID string) (*Manifest, error) {
	manifest := &Manifest{
		ProjectID: projectID,
		Version:   generateVersion(),
		Bundles:   bundles,
		CreatedAt: time.Now(),
		CreatedBy: userID,
	}

	if err := s.repo.Save(ctx, manifest); err != nil {
		return nil, err
	}

	// MVP HACK: Simulate Edge Propagation
	
	// Option 1: Redis
	if redisURL := os.Getenv("STK_KV_REDIS"); redisURL != "" {
		opts, err := redis.ParseURL(redisURL)
		if err != nil {
			fmt.Printf("Warning: Invalid Redis URL: %v\n", err)
		} else {
			rdb := redis.NewClient(opts)
			for _, b := range bundles {
				key := fmt.Sprintf("%s:logic:%s:%s", projectID, b.Namespace, b.Name)
				serverBundle := s.createServerBundle(b)
				data, _ := json.Marshal(serverBundle)
				
				if err := rdb.Set(ctx, key, string(data), 0).Err(); err != nil {
					fmt.Printf("Error propagating to Redis %s: %v\n", key, err)
				} else {
					fmt.Printf("Edge KV (Redis): Propagated %s\n", key)
				}
			}
			rdb.Close()
			return manifest, nil
		}
	}

	// Option 2: File System (Fallback)
	kvDir := filepath.Join(os.Getenv("HOME"), ".santokit", "tmp", "kv")
	if err := os.MkdirAll(kvDir, 0755); err != nil {
		fmt.Printf("Warning: Failed to create KV dir: %v\n", err)
	} else {
		for _, b := range bundles {
			key := fmt.Sprintf("%s:logic:%s:%s", projectID, b.Namespace, b.Name)
			serverBundle := s.createServerBundle(b)
			data, _ := json.Marshal(serverBundle)
			if err := os.WriteFile(filepath.Join(kvDir, key), data, 0644); err != nil {
				fmt.Printf("Warning: Failed to write KV key %s: %v\n", key, err)
			} else {
				fmt.Printf("Edge KV (File): Propagated %s\n", key)
			}
		}
	}

	return manifest, nil
}

func (s *Service) createServerBundle(b Bundle) map[string]interface{} {
	cfg := b.Config
	if cfg == nil {
		cfg = map[string]interface{}{
			"target": "main",
			"access": "public",
		}
	}

	return map[string]interface{}{
		"type":      b.Type,
		"namespace": b.Namespace,
		"name":      b.Name,
		"config":    cfg,
		"content":   string(b.Content),
		"hash":      b.Hash,
	}
}

// GetLatest retrieves the latest manifest
func (s *Service) GetLatest(ctx context.Context, projectID string) (*Manifest, error) {
	return s.repo.GetLatest(ctx, projectID)
}

// ToJSON serializes manifest to JSON
func (m *Manifest) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func generateVersion() string {
	return time.Now().Format("20060102150405")
}
