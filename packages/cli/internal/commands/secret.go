package commands

import (
	"fmt"

	"github.com/spf13/cobra"
)

var secretCmd = &cobra.Command{
	Use:   "secret",
	Short: "Manage secrets in Hub Vault",
	Long:  `Commands for managing encrypted secrets stored in Hub Vault.`,
}

var secretSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "Store a secret in Hub Vault",
	Long: `Store a secret securely in Santoki Hub Vault.

Secrets are:
  - Transmitted over TLS
  - Encrypted with AES-256-GCM in Hub
  - Re-encrypted with Project Master Key for Edge
  - Never stored in plain text

Use ${KEY_NAME} syntax in config files to reference secrets.`,
	Args: cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		key := args[0]
		value := args[1]
		fmt.Printf("Setting secret: %s\n", key)
		_ = value // Use value
		// TODO: Implement secret set
		// - Validate key format
		// - Send to Hub Vault via Communicator
	},
}

var secretListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all secret keys (values are hidden)",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Listing secrets...")
		// TODO: Implement secret list
	},
}

var secretDeleteCmd = &cobra.Command{
	Use:   "delete <key>",
	Short: "Delete a secret from Hub Vault",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		key := args[0]
		fmt.Printf("Deleting secret: %s\n", key)
		// TODO: Implement secret delete
	},
}

func init() {
	secretCmd.AddCommand(secretSetCmd)
	secretCmd.AddCommand(secretListCmd)
	secretCmd.AddCommand(secretDeleteCmd)
}
