// Package schema integrates with Atlas for database schema management.
// It handles schema validation, migration planning, and execution.
package schema

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Migration represents a database migration
type Migration struct {
	ID          string
	ProjectID   string
	Version     string
	SQL         string // Generated SQL statements
	Description string
	Applied     bool
}

// PlanResult contains the result of a schema plan operation
type PlanResult struct {
	Migrations []Migration
	HasChanges bool
	Summary    string
}

// Service provides schema management operations
type Service struct {
	atlasURL    string
	mu          sync.RWMutex
	state       map[string]map[string]string // projectID -> alias -> hcl
	lastPlanned map[string]map[string]string
}

// NewService creates a new schema service
func NewService(atlasURL string) *Service {
	return &Service{
		atlasURL:    atlasURL,
		state:       make(map[string]map[string]string),
		lastPlanned: make(map[string]map[string]string),
	}
}

// Plan generates a migration plan from HCL schema files
func (s *Service) Plan(ctx context.Context, projectID string, schemas map[string]string) (*PlanResult, error) {
	// schemas: map of alias -> HCL content (e.g., "main" -> "table users {...}")
	if projectID == "" {
		return nil, fmt.Errorf("projectID required")
	}
	if len(schemas) == 0 {
		return nil, fmt.Errorf("schemas required")
	}

	// Local mode: diff against in-memory state (Atlas integration not configured).
	s.mu.RLock()
	current := s.state[projectID]
	s.mu.RUnlock()

	changes := []Migration{}
	for alias, desired := range schemas {
		existing := ""
		if current != nil {
			existing = current[alias]
		}
		if normalizeHCL(existing) == normalizeHCL(desired) {
			continue
		}

		changes = append(changes, Migration{
			ID:          fmt.Sprintf("%s-%s", projectID, shortHash(desired)),
			ProjectID:   projectID,
			Version:     time.Now().Format("20060102150405"),
			SQL:         "-- local mode: no SQL generated",
			Description: fmt.Sprintf("schema update for %s", alias),
			Applied:     false,
		})
	}

	s.mu.Lock()
	s.lastPlanned[projectID] = copySchemas(schemas)
	s.mu.Unlock()

	return &PlanResult{
		Migrations: changes,
		HasChanges: len(changes) > 0,
		Summary:    planSummary(len(changes)),
	}, nil
}

// Apply executes pending migrations
func (s *Service) Apply(ctx context.Context, projectID string, migrations []Migration) error {
	// Local mode: apply the last planned schemas (no SQL execution).
	if projectID == "" {
		return fmt.Errorf("projectID required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	planned, ok := s.lastPlanned[projectID]
	if !ok {
		if len(migrations) == 0 {
			return nil
		}
		return fmt.Errorf("no planned schemas to apply")
	}

	s.state[projectID] = copySchemas(planned)
	delete(s.lastPlanned, projectID)

	return nil
}

// Validate checks HCL schema syntax and semantics
func (s *Service) Validate(ctx context.Context, hcl string) error {
	// Minimal validation in local mode.
	if strings.TrimSpace(hcl) == "" {
		return fmt.Errorf("schema content is empty")
	}
	if !hasBalancedBraces(hcl) {
		return fmt.Errorf("schema braces are not balanced")
	}

	return nil
}

// GetState retrieves the current schema state for a project
func (s *Service) GetState(ctx context.Context, projectID, alias string) (string, error) {
	if strings.TrimSpace(projectID) == "" {
		return "", fmt.Errorf("projectID required")
	}
	if strings.TrimSpace(alias) == "" {
		return "", fmt.Errorf("alias required")
	}
	_ = ctx

	s.mu.RLock()
	defer s.mu.RUnlock()

	projectState, ok := s.state[projectID]
	if !ok {
		return "", fmt.Errorf("schema state not found")
	}
	hcl, ok := projectState[alias]
	if !ok {
		return "", fmt.Errorf("schema alias not found")
	}
	return hcl, nil
}

func copySchemas(src map[string]string) map[string]string {
	dst := make(map[string]string, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func normalizeHCL(value string) string {
	return strings.TrimSpace(value)
}

func shortHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:6])
}

func hasBalancedBraces(value string) bool {
	count := 0
	for _, r := range value {
		switch r {
		case '{':
			count++
		case '}':
			count--
			if count < 0 {
				return false
			}
		}
	}
	return count == 0
}

func planSummary(changeCount int) string {
	if changeCount == 0 {
		return "Local mode: no changes detected"
	}
	if changeCount == 1 {
		return "Local mode: 1 schema change detected"
	}
	return fmt.Sprintf("Local mode: %d schema changes detected", changeCount)
}
