package commands

import (
	"fmt"

	"github.com/spf13/cobra"
)

var devCmd = &cobra.Command{
	Use:   "dev",
	Short: "Start local development server with hot reload",
	Long: `Start a zero-config local development environment that:

  - Watches for file changes in base/ and logic/
  - Automatically reloads on changes
  - Provides local API endpoints for testing
  - Emulates Edge runtime behavior`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Starting Santoki development server...")
		// TODO: Implement dev server
		// - Start file watcher (Scanner engine)
		// - Parse files on change (Parser engine)
		// - Bundle and serve locally (Integrator engine)
	},
}

func init() {
	devCmd.Flags().IntP("port", "p", 3000, "Port to run the dev server on")
}
