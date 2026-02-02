// Package communicator handles all communication with Santokit Hub.
// It manages authentication, API calls, and data transfer.
package communicator

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/integrator"
	"github.com/cookieshake/santokit/packages/cli/internal/userconfig"
)

// Config holds communicator configuration
type Config struct {
	HubURL    string
	Token     string
	ProjectID string
}

// Communicator handles Hub API communication
type Communicator struct {
	config *Config
	client *http.Client
}

// ProjectConfig represents stored project configuration
type ProjectConfig struct {
	Databases string `json:"databases"`
	Auth      string `json:"auth"`
	Storage   string `json:"storage"`
}

// Migration represents a schema migration
type Migration struct {
	ID          string `json:"id"`
	ProjectID   string `json:"project_id"`
	Version     string `json:"version"`
	SQL         string `json:"sql"`
	Description string `json:"description"`
	Applied     bool   `json:"applied"`
}

// PlanResult represents schema plan results
type PlanResult struct {
	Migrations []Migration `json:"migrations"`
	HasChanges bool        `json:"has_changes"`
	Summary    string      `json:"summary"`
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
	cfg, _ := userconfig.Load()
	var profile userconfig.Profile
	if cfg != nil {
		if p, ok := cfg.CurrentProfile(); ok {
			profile = p
		}
	}

	hubURL := os.Getenv("STK_HUB_URL")
	if hubURL == "" {
		hubURL = profile.HubURL
		if hubURL == "" {
			hubURL = "https://hub.santokit.dev"
		}
	}

	token := os.Getenv("STK_TOKEN")
	if token == "" {
		token = profile.Token
	}
	projectID := os.Getenv("STK_PROJECT_ID")
	if projectID == "" {
		projectID = profile.ProjectID
	}

	return New(&Config{
		HubURL:    hubURL,
		Token:     token,
		ProjectID: projectID,
	}), nil
}

// Config returns communicator configuration
func (c *Communicator) Config() *Config {
	return c.config
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
	c.setProjectHeader(req, manifest.ProjectID)

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

// PlanSchema requests a schema migration plan from Hub
func (c *Communicator) PlanSchema(projectID string, schemas map[string]string) (*PlanResult, error) {
	payload := map[string]interface{}{
		"schemas": schemas,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal schema plan: %w", err)
	}

	req, err := http.NewRequest("POST", c.config.HubURL+"/api/v1/schema/plan", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to plan schema: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("hub returned error: %s", string(body))
	}

	var result PlanResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode plan: %w", err)
	}

	return &result, nil
}

// ApplySchema applies migrations via Hub
func (c *Communicator) ApplySchema(projectID string, migrations []Migration) error {
	payload := map[string]interface{}{
		"migrations": migrations,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal schema apply: %w", err)
	}

	req, err := http.NewRequest("POST", c.config.HubURL+"/api/v1/schema/apply", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("hub returned error: %s", string(body))
	}

	return nil
}

// ApplyConfig uploads project configuration to Hub
func (c *Communicator) ApplyConfig(projectID string, configs map[string]string) error {
	payload := map[string]interface{}{
		"configs": configs,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	req, err := http.NewRequest("POST", c.config.HubURL+"/api/v1/config/apply", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to apply config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("hub returned error: %s", string(body))
	}

	return nil
}

// GetConfig retrieves project configuration from Hub
func (c *Communicator) GetConfig(projectID string) (*ProjectConfig, error) {
	req, err := http.NewRequest("GET", c.config.HubURL+"/api/v1/config", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("hub returned error: %s", string(body))
	}

	var cfg ProjectConfig
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("failed to decode config: %w", err)
	}

	return &cfg, nil
}

// FetchManifest downloads the current manifest from Hub
func (c *Communicator) FetchManifest(projectID string) (*integrator.Manifest, error) {
	req, err := http.NewRequest("GET", c.config.HubURL+"/api/v1/manifest", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

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
func (c *Communicator) SetSecret(projectID, key, value string) error {
	data, _ := json.Marshal(map[string]string{
		"key":   key,
		"value": value,
	})

	req, err := http.NewRequest("POST", c.config.HubURL+"/api/v1/secrets", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

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
func (c *Communicator) ListSecrets(projectID string) ([]string, error) {
	req, err := http.NewRequest("GET", c.config.HubURL+"/api/v1/secrets", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

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

// DeleteSecret removes a secret key from Hub Vault
func (c *Communicator) DeleteSecret(projectID, key string) error {
	req, err := http.NewRequest("DELETE", c.config.HubURL+"/api/v1/secrets/"+key, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	c.setProjectHeader(req, projectID)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to delete secret: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("hub returned error: %s", string(body))
	}

	return nil
}

func (c *Communicator) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	if c.config.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.config.Token)
	}
}

func (c *Communicator) setProjectHeader(req *http.Request, projectID string) {
	if projectID != "" {
		req.Header.Set("X-Santokit-Project-ID", projectID)
	}
}
