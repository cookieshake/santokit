// Package integrator bundles and integrates parsed files into deployable artifacts.
// It handles JS bundling (via esbuild), validation, and manifest generation.
package integrator

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/parser"
)

// Bundle represents a deployable bundle of logic or schema
type Bundle struct {
	Type      BundleType             `json:"type"`
	Namespace string                 `json:"namespace"`
	Name      string                 `json:"name"`
	Content   []byte                 `json:"content"`
	Hash      string                 `json:"hash"`
	Config    map[string]interface{} `json:"config,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
}

// BundleType represents the type of bundle
type BundleType string

const (
	BundleTypeLogic  BundleType = "logic"
	BundleTypeSchema BundleType = "schema"
)

// Manifest represents the complete project manifest
type Manifest struct {
	Version   string   `json:"version"`
	ProjectID string   `json:"project_id"`
	Bundles   []Bundle `json:"bundles"`
	CreatedAt time.Time `json:"created_at"`
}

// Integrator handles bundling and integration
type Integrator struct{}

// New creates a new Integrator
func New() *Integrator {
	return &Integrator{}
}

// BundleLogic creates a deployable bundle from a logic config
func (i *Integrator) BundleLogic(config *parser.LogicConfig) (*Bundle, error) {
	var content []byte
	var bundleType BundleType

	if config.SQL != "" {
		content = []byte(config.SQL)
		bundleType = "sql" // Server expects "sql" or "js"
	} else if config.JS != "" {
		// NOTE: In the future, we should bundle JS with esbuild to support internal module imports.
		// For now, we assume the JS file is self-contained (Zero Dependency policy).
		content = []byte(config.JS)
		bundleType = "js"
	}

	hash := sha256.Sum256(content)

	// Map config
	cfg := map[string]interface{}{
		"target": config.Target,
		"access": config.Access,
		"cache":  config.Cache,
	}
	
	// Convert params map
	if config.Params != nil {
		params := make(map[string]interface{})
		for k, v := range config.Params {
			params[k] = map[string]interface{}{
				"type": v.Type,
				"required": v.Required,
				"default": v.Default,
			}
		}
		cfg["params"] = params
	}

	return &Bundle{
		Type:      bundleType,
		Namespace: config.Namespace,
		Name:      config.Name,
		Content:   content,
		Hash:      hex.EncodeToString(hash[:]),
		Config:    cfg,
		CreatedAt: time.Now(),
	}, nil
}

// BundleSchema creates a deployable bundle from a schema config
func (i *Integrator) BundleSchema(config *parser.SchemaConfig) (*Bundle, error) {
	content := []byte(config.Raw)
	hash := sha256.Sum256(content)

	return &Bundle{
		Type:      BundleTypeSchema,
		Namespace: "base",
		Name:      config.Alias,
		Content:   content,
		Hash:      hex.EncodeToString(hash[:]),
		CreatedAt: time.Now(),
	}, nil
}

// CreateManifest creates a manifest from bundles
func (i *Integrator) CreateManifest(projectID string, bundles []Bundle) *Manifest {
	return &Manifest{
		Version:   "1.0",
		ProjectID: projectID,
		Bundles:   bundles,
		CreatedAt: time.Now(),
	}
}
