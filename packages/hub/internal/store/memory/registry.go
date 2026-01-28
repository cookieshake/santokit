package memory

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"github.com/cookieshake/santoki/packages/hub/internal/registry"
)

// RegistryRepository implements registry.Repository using in-memory storage
type RegistryRepository struct {
	mu        sync.RWMutex
	manifests map[string][]*registry.Manifest // projectID -> manifests (sorted by date)
}

// NewRegistryRepository creates a new in-memory registry repository
func NewRegistryRepository() *RegistryRepository {
	return &RegistryRepository{
		manifests: make(map[string][]*registry.Manifest),
	}
}

func (r *RegistryRepository) Save(ctx context.Context, manifest *registry.Manifest) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.manifests[manifest.ProjectID] = append(r.manifests[manifest.ProjectID], manifest)
	return nil
}

func (r *RegistryRepository) GetLatest(ctx context.Context, projectID string) (*registry.Manifest, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	list, ok := r.manifests[projectID]
	if !ok || len(list) == 0 {
		return nil, fmt.Errorf("manifest not found")
	}

	// Assume last one is latest (since we append)
	return list[len(list)-1], nil
}

func (r *RegistryRepository) GetByVersion(ctx context.Context, projectID, version string) (*registry.Manifest, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	list, ok := r.manifests[projectID]
	if !ok {
		return nil, fmt.Errorf("manifest not found")
	}

	for _, m := range list {
		if m.Version == version {
			return m, nil
		}
	}

	return nil, fmt.Errorf("manifest version not found")
}

func (r *RegistryRepository) ListVersions(ctx context.Context, projectID string) ([]string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	list, ok := r.manifests[projectID]
	if !ok {
		return []string{}, nil
	}

	versions := make([]string, len(list))
	for i, m := range list {
		versions[i] = m.Version
	}
	
	// Sort specifically if needed, but append order is chronological usually
	sort.Strings(versions) 
	
	return versions, nil
}
