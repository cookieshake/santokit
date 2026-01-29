package commands

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/communicator"
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

	success(fmt.Sprintf("✅ Manifest saved to %s", outPath))
	return nil
}
