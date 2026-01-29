package commands

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/communicator"
)

type ConfigCmd struct {
	Apply ConfigApplyCmd `cmd:"" help:"Apply project configuration to Hub."`
	Show  ConfigShowCmd  `cmd:"" help:"Show project configuration from Hub."`
}

type ConfigApplyCmd struct {
	Only string `help:"Apply only specific config(s): databases,auth,storage"`
}

func (c *ConfigApplyCmd) Run() error {
	title("Config Apply")
	rootDir, _ := os.Getwd()
	comm, err := communicator.NewFromEnv()
	if err != nil {
		return errorf("❌ Failed to initialize communicator: %v", err)
	}

	projectID := comm.Config().ProjectID
	if projectID == "" {
		projectID = os.Getenv("STK_PROJECT_ID")
	}
	if projectID == "" {
		return errorf("❌ STK_PROJECT_ID is required")
	}

	configDir := filepath.Join(rootDir, "config")
	configs := map[string]string{}
	only, err := parseConfigOnly(c.Only)
	if err != nil {
		return errorf("❌ %v", err)
	}

	if only["databases"] {
		if data, err := readOptionalFile(filepath.Join(configDir, "databases.yaml")); err != nil {
			return errorf("❌ Failed to read databases.yaml: %v", err)
		} else if data != "" {
			configs["databases"] = data
		}
	}

	if only["auth"] {
		if data, err := readOptionalFile(filepath.Join(configDir, "auth.yaml")); err != nil {
			return errorf("❌ Failed to read auth.yaml: %v", err)
		} else if data != "" {
			configs["auth"] = data
		}
	}

	if only["storage"] {
		if data, err := readOptionalFile(filepath.Join(configDir, "storage.yaml")); err != nil {
			return errorf("❌ Failed to read storage.yaml: %v", err)
		} else if data != "" {
			configs["storage"] = data
		}
	}

	if len(configs) == 0 {
	warn("⚠️  No config files found.")
		return nil
	}

	if err := comm.ApplyConfig(projectID, configs); err != nil {
		return errorf("❌ Config apply failed: %v", err)
	}

	success("✅ Project configuration applied.")
	return nil
}

type ConfigShowCmd struct{}

func (c *ConfigShowCmd) Run() error {
	comm, err := communicator.NewFromEnv()
	if err != nil {
		return errorf("❌ Failed to initialize communicator: %v", err)
	}

	projectID := comm.Config().ProjectID
	if projectID == "" {
		projectID = os.Getenv("STK_PROJECT_ID")
	}
	if projectID == "" {
		return errorf("❌ STK_PROJECT_ID is required")
	}

	cfg, err := comm.GetConfig(projectID)
	if err != nil {
		return errorf("❌ Failed to fetch config: %v", err)
	}

	title("Config Show")
	fmt.Println("databases.yaml")
	fmt.Println(cfg.Databases)
	fmt.Println("auth.yaml")
	fmt.Println(cfg.Auth)
	fmt.Println("storage.yaml")
	fmt.Println(cfg.Storage)
	return nil
}

func readOptionalFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

func parseConfigOnly(value string) (map[string]bool, error) {
	result := map[string]bool{
		"databases": true,
		"auth":      true,
		"storage":   true,
	}
	if value == "" {
		return result, nil
	}

	result = map[string]bool{
		"databases": false,
		"auth":      false,
		"storage":   false,
	}

	parts := strings.Split(value, ",")
	for _, part := range parts {
		key := strings.TrimSpace(strings.ToLower(part))
		if key == "" {
			continue
		}
		if _, ok := result[key]; !ok {
			return nil, fmt.Errorf("unknown config type %q (use databases,auth,storage)", key)
		}
		result[key] = true
	}
	return result, nil
}
