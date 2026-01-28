package commands

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "stk",
	Short: "Santoki CLI - Backend infrastructure made simple",
	Long: `Santoki (stk) is a backend infrastructure platform that abstracts away
backend complexity so developers can focus on business logic and data schemas.

Core Philosophy: Simple, Fast, Managed, and Open.`,
}

// Execute runs the root command
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.AddCommand(initCmd)
	rootCmd.AddCommand(devCmd)
	rootCmd.AddCommand(baseCmd)
	rootCmd.AddCommand(logicCmd)
	rootCmd.AddCommand(syncCmd)
	rootCmd.AddCommand(secretCmd)
}

func exitWithError(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}
