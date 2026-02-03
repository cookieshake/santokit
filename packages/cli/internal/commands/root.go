package commands

import (
	"fmt"
	"os"

	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// RootCmd represents the base command when called without any subcommands
var RootCmd = &cobra.Command{
	Use:   "stk",
	Short: "Santokit CLI - Backend infrastructure made simple",
	// Uncomment the following line if your bare application
	// has an action associated with it:
	// Run: func(cmd *cobra.Command, args []string) { },
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the RootCmd.
func Execute() error {
	return RootCmd.Execute()
}

func init() {
	RootCmd.AddCommand(NewConfigCmd())
	// TODO: Add other commands here as they are migrated
	RootCmd.AddCommand(NewInitCmd())
	RootCmd.AddCommand(NewLoginCmd())
	RootCmd.AddCommand(NewProfileCmd())
	RootCmd.AddCommand(NewProjectCmd())
	RootCmd.AddCommand(NewSchemaCmd())
	RootCmd.AddCommand(NewLogicCmd())
	RootCmd.AddCommand(NewSyncCmd())
	RootCmd.AddCommand(NewSecretCmd())
}

var (
	styleSuccess = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	styleWarn    = lipgloss.NewStyle().Foreground(lipgloss.Color("214"))
	styleError   = lipgloss.NewStyle().Foreground(lipgloss.Color("196"))
	styleTitle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("39"))
	styleInfo    = lipgloss.NewStyle().Foreground(lipgloss.Color("248"))
	styleHeader  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("81"))
	styleCell    = lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
)

func success(msg string) {
	fmt.Fprintln(os.Stdout, styleSuccess.Render(msg))
}

func warn(msg string) {
	fmt.Fprintln(os.Stdout, styleWarn.Render(msg))
}

func title(msg string) {
	fmt.Fprintln(os.Stdout, styleTitle.Render(msg))
}

func info(msg string) {
	fmt.Fprintln(os.Stdout, styleInfo.Render(msg))
}

func errorf(format string, args ...any) error {
	return fmt.Errorf(styleError.Render(fmt.Sprintf(format, args...)))
}

func tableRow(cols ...string) string {
	if len(cols) == 0 {
		return ""
	}
	widths := []int{14, 32, 18}
	row := make([]string, len(cols))
	for i, col := range cols {
		width := widths[min(i, len(widths)-1)]
		row[i] = lipgloss.NewStyle().Width(width).Render(col)
	}
	return lipgloss.JoinHorizontal(lipgloss.Left, row...)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
