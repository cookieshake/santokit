package commands

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/communicator"
)

func NewSecretCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "secret",
		Short: "Manage secrets in Hub Vault.",
	}
	cmd.AddCommand(newSecretSetCmd())
	cmd.AddCommand(newSecretListCmd())
	cmd.AddCommand(newSecretDeleteCmd())
	return cmd
}

func newSecretSetCmd() *cobra.Command {
	var key, value string
	cmd := &cobra.Command{
		Use:   "set [key] [value]",
		Short: "Store a secret in Hub Vault.",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			key, value = args[0], args[1]
			title("Secret Set")
			info(fmt.Sprintf("key: %s", key))
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

			if err := comm.SetSecret(projectID, key, value); err != nil {
				return errorf("❌ Failed to set secret: %v", err)
			}
			success("✅ Secret stored.")
			return nil
		},
	}
	return cmd
}

func newSecretListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List all secret keys.",
		RunE: func(cmd *cobra.Command, args []string) error {
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
		},
	}
}

func newSecretDeleteCmd() *cobra.Command {
	var key string
	cmd := &cobra.Command{
		Use:   "delete [key]",
		Short: "Delete a secret from Hub Vault.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			key = args[0]
			title("Secret Delete")
			info(fmt.Sprintf("key: %s", key))
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

			if err := comm.DeleteSecret(projectID, key); err != nil {
				return errorf("❌ Failed to delete secret: %v", err)
			}
			success("✅ Secret deleted.")
			return nil
		},
	}
	return cmd
}
