package sqlstore

import (
	"context"
	"database/sql"

	"github.com/cookieshake/santokit/packages/hub/internal/vault"
)

type VaultRepository struct {
	db      *sql.DB
	dialect string
}

func NewVaultRepository(db *sql.DB, dialect string) *VaultRepository {
	return &VaultRepository{db: db, dialect: dialect}
}

func (r *VaultRepository) Set(ctx context.Context, secret *vault.Secret) error {
	query := Rebind(r.dialect, `INSERT INTO vault_secrets (project_id, secret_key, encrypted_value)
		VALUES (?, ?, ?)
		ON CONFLICT (project_id, secret_key) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value`)

	if r.dialect != DialectPostgres {
		query = Rebind(r.dialect, `INSERT INTO vault_secrets (project_id, secret_key, encrypted_value)
			VALUES (?, ?, ?)
			ON CONFLICT (project_id, secret_key) DO UPDATE SET encrypted_value = excluded.encrypted_value`)
	}

	_, err := r.db.ExecContext(ctx, query, secret.ProjectID, secret.Key, secret.EncryptedVal)
	return err
}

func (r *VaultRepository) Get(ctx context.Context, projectID, key string) (*vault.Secret, error) {
	query := Rebind(r.dialect, `SELECT encrypted_value FROM vault_secrets WHERE project_id = ? AND secret_key = ? LIMIT 1`)

	var encrypted string
	if err := r.db.QueryRowContext(ctx, query, projectID, key).Scan(&encrypted); err != nil {
		return nil, vault.ErrSecretNotFound
	}

	return &vault.Secret{
		Key:          key,
		EncryptedVal: encrypted,
		ProjectID:    projectID,
	}, nil
}

func (r *VaultRepository) Delete(ctx context.Context, projectID, key string) error {
	query := Rebind(r.dialect, `DELETE FROM vault_secrets WHERE project_id = ? AND secret_key = ?`)
	_, err := r.db.ExecContext(ctx, query, projectID, key)
	return err
}

func (r *VaultRepository) List(ctx context.Context, projectID string) ([]string, error) {
	query := Rebind(r.dialect, `SELECT secret_key FROM vault_secrets WHERE project_id = ?`)
	rows, err := r.db.QueryContext(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, nil
}
