// Package communicator handles all communication with Santoki Hub.
// It manages authentication, API calls, and data transfer.
package communicator

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/cookieshake/santoki/packages/cli/internal/engine/integrator"
)

// Config holds communicator configuration
type Config struct {
	HubURL   string
	Token    string
	ProjectID string
}

// Communicator handles Hub API communication
type Communicator struct {
	config *Config
	client *http.Client
}

// New creates a new Communicator
func New(config *Config) *Communicator {
	return &Communicator{
		config: config,
		client: &http.Client{},
	}
}

// NewFromEnv creates a Communicator using environment variables
func NewFromEnv() (*Communicator, error) {
	hubURL := os.Getenv("STK_HUB_URL")
	if hubURL == "" {
		hubURL = "https://hub.santoki.dev"
	}
	
	token := os.Getenv("STK_TOKEN")
	projectID := os.Getenv("STK_PROJECT_ID")
	
	return New(&Config{
		HubURL:    hubURL,
		Token:     token,
		ProjectID: projectID,
	}), nil
}

// PushManifest uploads a manifest to Hub
func (c *Communicator) PushManifest(manifest *integrator.Manifest) error {
	data, err := json.Marshal(manifest)
	if err != nil {
		return fmt.Errorf("failed to marshal manifest: %w", err)
	}
	
	req, err := http.NewRequest("POST", c.config.HubURL+"/api/v1/manifest", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	
	c.setHeaders(req)
	
	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to push manifest: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("hub returned error: %s", string(body))
	}
	
	return nil
}

// FetchManifest downloads the current manifest from Hub
func (c *Communicator) FetchManifest() (*integrator.Manifest, error) {
	req, err := http.NewRequest("GET", c.config.HubURL+"/api/v1/manifest", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	
	c.setHeaders(req)
	
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch manifest: %w", err)
	}
	defer resp.Body.Close()
	
	var manifest integrator.Manifest
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return nil, fmt.Errorf("failed to decode manifest: %w", err)
	}
	
	return &manifest, nil
}

// SetSecret stores a secret in Hub Vault
func (c *Communicator) SetSecret(key, value string) error {
	data, _ := json.Marshal(map[string]string{
		"key":   key,
		"value": value,
	})
	
	req, err := http.NewRequest("POST", c.config.HubURL+"/api/v1/secrets", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	
	c.setHeaders(req)
	
	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to set secret: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("hub returned error: %s", string(body))
	}
	
	return nil
}

// ListSecrets retrieves all secret keys (values are not returned)
func (c *Communicator) ListSecrets() ([]string, error) {
	req, err := http.NewRequest("GET", c.config.HubURL+"/api/v1/secrets", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	
	c.setHeaders(req)
	
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to list secrets: %w", err)
	}
	defer resp.Body.Close()
	
	var keys []string
	if err := json.NewDecoder(resp.Body).Decode(&keys); err != nil {
		return nil, fmt.Errorf("failed to decode secrets: %w", err)
	}
	
	return keys, nil
}

func (c *Communicator) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.config.Token)
	req.Header.Set("X-Project-ID", c.config.ProjectID)
}
