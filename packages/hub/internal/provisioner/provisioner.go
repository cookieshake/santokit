// Package provisioner handles deployment of bundles to Edge KV.
// It encrypts and uploads logic bundles, configs, and secrets.
package provisioner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// EdgeBundle represents a bundle ready for Edge deployment
type EdgeBundle struct {
	Key       string    `json:"key"`     // KV key (e.g., "project:namespace:name")
	Content   []byte    `json:"content"` // Encrypted content
	Hash      string    `json:"hash"`    // Content hash
	ExpiresAt time.Time `json:"expires_at,omitempty"`
}

// Config holds provisioner configuration
type Config struct {
	EdgeKVURL   string
	EdgeKVToken string
}

// Service provides Edge provisioning operations
type Service struct {
	config *Config
	client *http.Client
}

// NewService creates a new provisioner service
func NewService(config *Config) *Service {
	return &Service{
		config: config,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// Provision uploads bundles to Edge KV
func (s *Service) Provision(ctx context.Context, projectID string, bundles []EdgeBundle) error {
	for _, bundle := range bundles {
		if err := s.uploadBundle(ctx, bundle); err != nil {
			return fmt.Errorf("failed to provision bundle %s: %w", bundle.Key, err)
		}
	}

	return nil
}

// ProvisionSecrets uploads encrypted secrets to Edge KV
func (s *Service) ProvisionSecrets(ctx context.Context, projectID string, secrets map[string][]byte) error {
	for key, encryptedValue := range secrets {
		bundle := EdgeBundle{
			Key:     fmt.Sprintf("%s:secrets:%s", projectID, key),
			Content: encryptedValue,
		}

		if err := s.uploadBundle(ctx, bundle); err != nil {
			return fmt.Errorf("failed to provision secret %s: %w", key, err)
		}
	}

	return nil
}

// Invalidate removes bundles from Edge KV
func (s *Service) Invalidate(ctx context.Context, keys []string) error {
	for _, key := range keys {
		if err := s.deleteBundle(ctx, key); err != nil {
			return fmt.Errorf("failed to invalidate %s: %w", key, err)
		}
	}

	return nil
}

func (s *Service) uploadBundle(ctx context.Context, bundle EdgeBundle) error {
	data, err := json.Marshal(bundle)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "PUT", s.config.EdgeKVURL+"/"+bundle.Key, bytes.NewReader(data))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+s.config.EdgeKVToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("edge KV returned status %d", resp.StatusCode)
	}

	return nil
}

func (s *Service) deleteBundle(ctx context.Context, key string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", s.config.EdgeKVURL+"/"+key, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+s.config.EdgeKVToken)

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("edge KV returned status %d", resp.StatusCode)
	}

	return nil
}
