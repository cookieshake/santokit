package memory

import (
	"context"
	"sync"

	"github.com/cookieshake/santoki/packages/hub/internal/vault"
)

// VaultRepository implements vault.Repository using in-memory storage
type VaultRepository struct {
	mu      sync.RWMutex
	secrets map[string]map[string]*vault.Secret // projectID -> key -> Secret
}

// NewVaultRepository creates a new in-memory vault repository
func NewVaultRepository() *VaultRepository {
	return &VaultRepository{
		secrets: make(map[string]map[string]*vault.Secret),
	}
}

func (r *VaultRepository) Set(ctx context.Context, secret *vault.Secret) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.secrets[secret.ProjectID]; !ok {
		r.secrets[secret.ProjectID] = make(map[string]*vault.Secret)
	}

	r.secrets[secret.ProjectID][secret.Key] = secret
	return nil
}

func (r *VaultRepository) Get(ctx context.Context, projectID, key string) (*vault.Secret, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	projectSecrets, ok := r.secrets[projectID]
	if !ok {
		return nil, vault.ErrSecretNotFound
	}

	secret, ok := projectSecrets[key]
	if !ok {
		return nil, vault.ErrSecretNotFound
	}

	return secret, nil
}

func (r *VaultRepository) Delete(ctx context.Context, projectID, key string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if projectSecrets, ok := r.secrets[projectID]; ok {
		delete(projectSecrets, key)
	}
	return nil
}

func (r *VaultRepository) List(ctx context.Context, projectID string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	projectSecrets, ok := r.secrets[projectID]
	if !ok {
		return []string{}, nil
	}

	keys := make([]string, 0, len(projectSecrets))
	for k := range projectSecrets {
		keys = append(keys, k)
	}

	return keys, nil
}
