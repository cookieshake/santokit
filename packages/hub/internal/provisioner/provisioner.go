package provisioner
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
	Key       string    `json:"key"`       // KV key (e.g., "project:namespace:name")
	Content   []byte    `json:"content"`   // Encrypted content
	Hash      string    `json:"hash"`      // Content hash
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






















































































}	return nil		}		return fmt.Errorf("edge KV returned status %d", resp.StatusCode)	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {		defer resp.Body.Close()	}		return err	if err != nil {	resp, err := s.client.Do(req)		req.Header.Set("Authorization", "Bearer "+s.config.EdgeKVToken)		}		return err	if err != nil {	req, err := http.NewRequestWithContext(ctx, "DELETE", s.config.EdgeKVURL+"/"+key, nil)func (s *Service) deleteBundle(ctx context.Context, key string) error {}	return nil		}		return fmt.Errorf("edge KV returned status %d", resp.StatusCode)	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {		defer resp.Body.Close()	}		return err	if err != nil {	resp, err := s.client.Do(req)		req.Header.Set("Content-Type", "application/json")	req.Header.Set("Authorization", "Bearer "+s.config.EdgeKVToken)		}		return err	if err != nil {	req, err := http.NewRequestWithContext(ctx, "PUT", s.config.EdgeKVURL+"/"+bundle.Key, bytes.NewReader(data))		}		return err	if err != nil {	data, err := json.Marshal(bundle)func (s *Service) uploadBundle(ctx context.Context, bundle EdgeBundle) error {}	return nil		}		}			return fmt.Errorf("failed to invalidate %s: %w", key, err)		if err := s.deleteBundle(ctx, key); err != nil {	for _, key := range keys {func (s *Service) Invalidate(ctx context.Context, keys []string) error {// Invalidate removes bundles from Edge KV}	return nil		}		}			return fmt.Errorf("failed to provision secret %s: %w", key, err)		if err := s.uploadBundle(ctx, bundle); err != nil {				}			Content: encryptedValue,			Key:     fmt.Sprintf("%s:secrets:%s", projectID, key),		bundle := EdgeBundle{	for key, encryptedValue := range secrets {func (s *Service) ProvisionSecrets(ctx context.Context, projectID string, secrets map[string][]byte) error {// ProvisionSecrets uploads encrypted secrets to Edge KV}	return nil		}		}			return fmt.Errorf("failed to provision bundle %s: %w", bundle.Key, err)		if err := s.uploadBundle(ctx, bundle); err != nil {	for _, bundle := range bundles {func (s *Service) Provision(ctx context.Context, projectID string, bundles []EdgeBundle) error {// Provision uploads bundles to Edge KV