package commands

import (
	"fmt"
	"os"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/communicator"
)

type SecretCmd struct {
	Set    SecretSetCmd    `cmd:"" help:"Store a secret in Hub Vault."`
	List   SecretListCmd   `cmd:"" help:"List all secret keys."`
	Delete SecretDeleteCmd `cmd:"" help:"Delete a secret from Hub Vault."`
}

type SecretSetCmd struct {
	Key   string `arg:"" name:"key"`
	Value string `arg:"" name:"value"`
}

func (c *SecretSetCmd) Run() error {
	title("Secret Set")
	info(fmt.Sprintf("key: %s", c.Key))
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

	if err := comm.SetSecret(projectID, c.Key, c.Value); err != nil {
		return errorf("❌ Failed to set secret: %v", err)
	}
	success("✅ Secret stored.")
	return nil
}

type SecretListCmd struct{}

func (c *SecretListCmd) Run() error {
	title("Secret List")
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

	keys, err := comm.ListSecrets(projectID)
	if err != nil {
		return errorf("❌ Failed to list secrets: %v", err)
	}
	if len(keys) == 0 {
		fmt.Println("No secrets found.")
		return nil
	}
	fmt.Println(styleHeader.Render(tableRow("KEY", "", "")))
	for _, key := range keys {
		fmt.Println(styleCell.Render(tableRow(key, "", "")))
	}
	return nil
}

type SecretDeleteCmd struct {
	Key string `arg:"" name:"key"`
}

func (c *SecretDeleteCmd) Run() error {
	title("Secret Delete")
	info(fmt.Sprintf("key: %s", c.Key))
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

	if err := comm.DeleteSecret(projectID, c.Key); err != nil {
		return errorf("❌ Failed to delete secret: %v", err)
	}
	success("✅ Secret deleted.")
	return nil
}
