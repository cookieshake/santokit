package projectconfig

import (
	"context"
	"fmt"
	"sync"
)

type Config struct {
	Databases string `json:"databases"`
	Auth      string `json:"auth"`
	Storage   string `json:"storage"`
}

type Service struct {
	mu        sync.RWMutex
	byProject map[string]Config
	repo      Repository
}

func NewService() *Service {
	return &Service{
		byProject: make(map[string]Config),
	}
}

type Repository interface {
	Set(ctx context.Context, projectID string, cfg Config) error
	Get(ctx context.Context, projectID string) (Config, error)
}

func NewServiceWithRepository(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Set(ctx context.Context, projectID string, cfg Config) error {
	if projectID == "" {
		return fmt.Errorf("projectID required")
	}
	if s.repo != nil {
		return s.repo.Set(ctx, projectID, cfg)
	}
	_ = ctx
	s.mu.Lock()
	defer s.mu.Unlock()
	s.byProject[projectID] = cfg
	return nil
}

func (s *Service) Get(ctx context.Context, projectID string) (Config, error) {
	if projectID == "" {
		return Config{}, fmt.Errorf("projectID required")
	}
	if s.repo != nil {
		return s.repo.Get(ctx, projectID)
	}
	_ = ctx
	s.mu.RLock()
	defer s.mu.RUnlock()
	cfg, ok := s.byProject[projectID]
	if !ok {
		return Config{}, fmt.Errorf("project not found")
	}
	return cfg, nil
}
