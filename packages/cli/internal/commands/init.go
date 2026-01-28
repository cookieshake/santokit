package commands

import (
	"fmt"

	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init [project-name]",
	Short: "Initialize a new Santoki project",
	Long: `Initialize a new Santoki project with the standard directory structure:

  base/       - Infrastructure definitions (DB schemas, auth, storage)
  logic/      - Business logic (SQL, JS handlers)`,
	Args: cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		projectName := "."
		if len(args) > 0 {
			projectName = args[0]
		}

		fmt.Printf("Initializing Santoki project: %s\n", projectName)
		// TODO: Implement project scaffolding
		// - Create base/ directory with sample schema
		// - Create logic/ directory with sample handler
		// - Create santoki.yaml config file
	},
}
