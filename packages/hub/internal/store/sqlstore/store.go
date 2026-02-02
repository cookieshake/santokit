package sqlstore

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

const (
	DialectPostgres = "postgres"
	DialectSQLite   = "sqlite"
)

func Open(dsn string) (*sql.DB, string, error) {
	driver, normalized, dialect, err := normalizeDSN(dsn)
	if err != nil {
		return nil, "", err
	}

	db, err := sql.Open(driver, normalized)
	if err != nil {
		return nil, "", err
	}

	if err := db.Ping(); err != nil {
		return nil, "", err
	}

	if err := migrate(db, dialect); err != nil {
		return nil, "", err
	}

	return db, dialect, nil
}

func normalizeDSN(dsn string) (driver string, normalized string, dialect string, err error) {
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		return "pgx", dsn, DialectPostgres, nil
	}

	if dsn == "" {
		home, _ := os.UserHomeDir()
		path := filepath.Join(home, ".santokit", "hub.db")
		return "sqlite", "file:" + path + "?cache=shared&_pragma=foreign_keys(1)", DialectSQLite, nil
	}

	if strings.HasPrefix(dsn, "sqlite://") {
		path := strings.TrimPrefix(dsn, "sqlite://")
		return "sqlite", sqlitePath(path), DialectSQLite, nil
	}

	if strings.HasPrefix(dsn, "file:") || strings.HasSuffix(dsn, ".db") {
		return "sqlite", sqlitePath(strings.TrimPrefix(dsn, "file:")), DialectSQLite, nil
	}

	if strings.Contains(dsn, "/") {
		return "sqlite", sqlitePath(dsn), DialectSQLite, nil
	}

	return "", "", "", fmt.Errorf("unsupported database url: %s", dsn)
}

func sqlitePath(path string) string {
	if strings.HasPrefix(path, "file:") {
		return path
	}
	if path == "" {
		path = "hub.db"
	}
	if !strings.HasPrefix(path, "/") {
		home, _ := os.UserHomeDir()
		path = filepath.Join(home, ".santokit", path)
	}
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	return "file:" + path + "?cache=shared&_pragma=foreign_keys(1)"
}

func migrate(db *sql.DB, dialect string) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS registry_manifests (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			version TEXT NOT NULL,
			bundles TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			created_by TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS vault_secrets (
			project_id TEXT NOT NULL,
			secret_key TEXT NOT NULL,
			encrypted_value TEXT NOT NULL,
			PRIMARY KEY (project_id, secret_key)
		)`,
		`CREATE TABLE IF NOT EXISTS project_configs (
			project_id TEXT PRIMARY KEY,
			databases TEXT NOT NULL,
			auth TEXT NOT NULL,
			storage TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL,
			updated_at TIMESTAMP NOT NULL,
			team_id TEXT NOT NULL,
			owner_id TEXT NOT NULL,
			master_key TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS teams (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			created_at TIMESTAMP NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS team_members (
			team_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			email TEXT NOT NULL,
			role TEXT NOT NULL,
			PRIMARY KEY (team_id, user_id, email)
		)`,
		`CREATE TABLE IF NOT EXISTS personal_teams (
			user_id TEXT PRIMARY KEY,
			team_id TEXT NOT NULL
		)`,
	}

	for _, stmt := range statements {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}
