package userconfig

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Profile struct {
	HubURL    string `json:"hubUrl"`
	ProjectID string `json:"projectId"`
	Token     string `json:"token"`
}

type Config struct {
	Current  string             `json:"current"`
	Profiles map[string]Profile `json:"profiles"`
}

func Load() (*Config, error) {
	path, err := configPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{Profiles: map[string]Profile{}}, nil
		}
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if cfg.Profiles == nil {
		cfg.Profiles = map[string]Profile{}
	}

	return &cfg, nil
}

func Save(cfg *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

func (c *Config) CurrentProfile() (Profile, bool) {
	if c == nil || c.Current == "" {
		return Profile{}, false
	}
	profile, ok := c.Profiles[c.Current]
	return profile, ok
}

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".santokit", "config.json"), nil
}
