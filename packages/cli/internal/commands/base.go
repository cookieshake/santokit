package commands

import (
	"fmt"

	"github.com/spf13/cobra"
)

var baseCmd = &cobra.Command{
	Use:   "base",
	Short: "Manage infrastructure (schemas, auth, storage)",
	Long:  `Commands for managing base infrastructure definitions.`,
}

var basePushCmd = &cobra.Command{
	Use:   "push",
	Short: "Deploy infrastructure changes to Hub",
	Long: `Push infrastructure changes (DB schemas, auth config, storage config) to Santoki Hub.

This command will:
  - Validate all .hcl schema files
  - Validate auth.yaml and storage.yaml
  - Generate migration plan via Atlas
  - Apply changes after confirmation`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Pushing base infrastructure...")
		// TODO: Implement base push
		// - Scan base/ directory
		// - Parse HCL/YAML files
		// - Send to Hub for validation and migration
	},
}

var basePlanCmd = &cobra.Command{
	Use:   "plan",
	Short: "Preview infrastructure changes without applying",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Planning base infrastructure changes...")
		// TODO: Implement base plan
	},
}

func init() {
	baseCmd.AddCommand(basePushCmd)
	baseCmd.AddCommand(basePlanCmd)
}
