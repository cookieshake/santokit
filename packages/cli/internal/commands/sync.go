package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/communicator"
	"github.com/cookieshake/santokit/packages/cli/internal/engine/generator"
)

type SyncCmd struct{}

func (c *SyncCmd) Run() error {
	title("Sync")
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

	manifest, err := comm.FetchManifest(projectID)
	if err != nil {
		return errorf("❌ Failed to fetch manifest: %v", err)
	}

	// Save manifest to cache
	cacheDir := filepath.Join(rootDir, ".santokit")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return errorf("❌ Failed to create cache dir: %v", err)
	}
	outPath := filepath.Join(cacheDir, "manifest.json")
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return errorf("❌ Failed to serialize manifest: %v", err)
	}
	if err := os.WriteFile(outPath, data, 0644); err != nil {
		return errorf("❌ Failed to write manifest: %v", err)
	}

	// Generate types
	typeDef := generator.GenerateTypes(manifest)

	typePath, err := resolveCodegenOutput(rootDir)
	if err != nil {
		return errorf("❌ Failed to resolve codegen output: %v", err)
	}

	if err := os.MkdirAll(filepath.Dir(typePath), 0755); err != nil {
		return errorf("❌ Failed to create type definition directory: %v", err)
	}

	if err := os.WriteFile(typePath, []byte(typeDef), 0644); err != nil {
		return errorf("❌ Failed to write type definition: %v", err)
	}

	success(fmt.Sprintf("✅ Manifest saved to %s", outPath))
	success(fmt.Sprintf("✅ Type definitions generated at %s", typePath))
	return nil
}

type stkConfig struct {
	ProjectID string `json:"project_id"`
	Codegen   struct {
		Output string `json:"output"`
	} `json:"codegen"`
}

func resolveCodegenOutput(rootDir string) (string, error) {
	path := "santokit-env.d.ts"

	cfgPath := filepath.Join(rootDir, "stk.config.json")
	if data, err := os.ReadFile(cfgPath); err == nil {
		var cfg stkConfig
		if err := json.Unmarshal(data, &cfg); err != nil {
			return "", err
		}
		if cfg.Codegen.Output != "" {
			path = cfg.Codegen.Output
		}
	}

	if filepath.IsAbs(path) {
		return path, nil
	}
	return filepath.Join(rootDir, path), nil
}
