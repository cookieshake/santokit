package commands

import (
	"fmt"
	"os"

	"github.com/alecthomas/kong"
	"github.com/charmbracelet/lipgloss"
)

type CLI struct {
	Init    InitCmd    `cmd:"" help:"Initialize a new Santokit project."`
	Dev     DevCmd     `cmd:"" help:"Start local development server."`
	Profile ProfileCmd `cmd:"" help:"Manage Hub profiles."`
	Project ProjectCmd `cmd:"" help:"Manage project settings."`
	Schema  SchemaCmd  `cmd:"" help:"Manage database schema definitions." aliases:"base"`
	Config  ConfigCmd  `cmd:"" help:"Manage project configuration."`
	Logic   LogicCmd   `cmd:"" help:"Deploy and validate logic."`
	Sync    SyncCmd    `cmd:"" help:"Download manifest and generate type definitions."`
	Secret  SecretCmd  `cmd:"" help:"Manage secrets in Hub Vault."`
}

// Execute runs the root command
func Execute() error {
	var cli CLI
	parser, err := kong.New(&cli,
		kong.Name("stk"),
		kong.Description("Santokit CLI - Backend infrastructure made simple"),
		kong.UsageOnError(),
	)
	if err != nil {
		return err
	}
	ctx, err := parser.Parse(os.Args[1:])
	if err != nil {
		return err
	}
	return ctx.Run()
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
