package sqlstore

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/cookieshake/santokit/packages/hub/internal/registry"
)

type RegistryRepository struct {
	db      *sql.DB
	dialect string
}

func NewRegistryRepository(db *sql.DB, dialect string) *RegistryRepository {
	return &RegistryRepository{db: db, dialect: dialect}
}

func (r *RegistryRepository) Save(ctx context.Context, manifest *registry.Manifest) error {
	bundles, err := json.Marshal(manifest.Bundles)
	if err != nil {
		return err
	}

	id := fmt.Sprintf("%s:%s", manifest.ProjectID, manifest.Version)
	query := Rebind(r.dialect, `INSERT INTO registry_manifests (
		id, project_id, version, bundles, created_at, created_by
	) VALUES (?, ?, ?, ?, ?, ?)`)

	_, err = r.db.ExecContext(ctx, query, id, manifest.ProjectID, manifest.Version, string(bundles), manifest.CreatedAt, manifest.CreatedBy)
	return err
}

func (r *RegistryRepository) GetLatest(ctx context.Context, projectID string) (*registry.Manifest, error) {
	query := Rebind(r.dialect, `SELECT id, project_id, version, bundles, created_at, created_by
		FROM registry_manifests WHERE project_id = ?
		ORDER BY created_at DESC LIMIT 1`)

	var (
		id        string
		pid       string
		version   string
		bundles   string
		createdAt time.Time
		createdBy string
	)

	if err := r.db.QueryRowContext(ctx, query, projectID).Scan(&id, &pid, &version, &bundles, &createdAt, &createdBy); err != nil {
		return nil, err
	}

	var parsed []registry.Bundle
	if err := json.Unmarshal([]byte(bundles), &parsed); err != nil {
		return nil, err
	}

	return &registry.Manifest{
		ID:        id,
		ProjectID: pid,
		Version:   version,
		Bundles:   parsed,
		CreatedAt: createdAt,
		CreatedBy: createdBy,
	}, nil
}

func (r *RegistryRepository) GetByVersion(ctx context.Context, projectID, version string) (*registry.Manifest, error) {
	query := Rebind(r.dialect, `SELECT id, project_id, version, bundles, created_at, created_by
		FROM registry_manifests WHERE project_id = ? AND version = ? LIMIT 1`)

	var (
		id        string
		pid       string
		ver       string
		bundles   string
		createdAt time.Time
		createdBy string
	)

	if err := r.db.QueryRowContext(ctx, query, projectID, version).Scan(&id, &pid, &ver, &bundles, &createdAt, &createdBy); err != nil {
		return nil, err
	}

	var parsed []registry.Bundle
	if err := json.Unmarshal([]byte(bundles), &parsed); err != nil {
		return nil, err
	}

	return &registry.Manifest{
		ID:        id,
		ProjectID: pid,
		Version:   ver,
		Bundles:   parsed,
		CreatedAt: createdAt,
		CreatedBy: createdBy,
	}, nil
}

func (r *RegistryRepository) ListVersions(ctx context.Context, projectID string) ([]string, error) {
	query := Rebind(r.dialect, `SELECT version FROM registry_manifests WHERE project_id = ? ORDER BY created_at ASC`)

	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var versions []string
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		versions = append(versions, version)
	}

	return versions, nil
}
