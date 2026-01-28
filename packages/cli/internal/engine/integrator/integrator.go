// Package integrator bundles and integrates parsed files into deployable artifacts.
// It handles JS bundling (via esbuild), validation, and manifest generation.
package integrator

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/cookieshake/santoki/packages/cli/internal/engine/parser"
)

// Bundle represents a deployable bundle of logic or schema
type Bundle struct {
	Type      BundleType
	Namespace string
	Name      string
	Content   []byte
	Hash      string
	CreatedAt time.Time
}

// BundleType represents the type of bundle
type BundleType string

const (
	BundleTypeLogic  BundleType = "logic"
	BundleTypeSchema BundleType = "schema"
)

// Manifest represents the complete project manifest
type Manifest struct {
	Version   string
	ProjectID string
	Bundles   []Bundle
	CreatedAt time.Time
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
	
	if config.SQL != "" {
		content = []byte(config.SQL)
	} else if config.JS != "" {
		// TODO: Bundle JS with esbuild (no external dependencies)
		content = []byte(config.JS)
	}
	
	hash := sha256.Sum256(content)
	
	return &Bundle{
		Type:      BundleTypeLogic,
		Namespace: config.Namespace,
		Name:      config.Name,
		Content:   content,
		Hash:      hex.EncodeToString(hash[:]),
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
