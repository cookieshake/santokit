package sqlstore

import (
	"context"
	"database/sql"

	"github.com/cookieshake/santokit/packages/hub/internal/projectconfig"
)

type ProjectConfigRepository struct {
	db      *sql.DB
	dialect string
}

func NewProjectConfigRepository(db *sql.DB, dialect string) *ProjectConfigRepository {
	return &ProjectConfigRepository{db: db, dialect: dialect}
}

func (r *ProjectConfigRepository) Set(ctx context.Context, projectID string, cfg projectconfig.Config) error {
	query := Rebind(r.dialect, `INSERT INTO project_configs (project_id, databases, auth, storage)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (project_id) DO UPDATE SET databases = EXCLUDED.databases, auth = EXCLUDED.auth, storage = EXCLUDED.storage`)

	if r.dialect != DialectPostgres {
		query = Rebind(r.dialect, `INSERT INTO project_configs (project_id, databases, auth, storage)
			VALUES (?, ?, ?, ?)
			ON CONFLICT (project_id) DO UPDATE SET databases = excluded.databases, auth = excluded.auth, storage = excluded.storage`)
	}

	_, err := r.db.ExecContext(ctx, query, projectID, cfg.Databases, cfg.Auth, cfg.Storage)
	return err
}

func (r *ProjectConfigRepository) Get(ctx context.Context, projectID string) (projectconfig.Config, error) {
	query := Rebind(r.dialect, `SELECT databases, auth, storage FROM project_configs WHERE project_id = ? LIMIT 1`)

	var cfg projectconfig.Config
	if err := r.db.QueryRowContext(ctx, query, projectID).Scan(&cfg.Databases, &cfg.Auth, &cfg.Storage); err != nil {
		return projectconfig.Config{}, err
	}

	return cfg, nil
}
