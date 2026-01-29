package commands

import "fmt"

type InitCmd struct {
	ProjectName string `arg:"" optional:"" help:"Project directory name"`
}

func (c *InitCmd) Run() error {
	projectName := "."
	if c.ProjectName != "" {
		projectName = c.ProjectName
	}

	fmt.Printf("Initializing Santokit project: %s\n", projectName)
	// TODO: Implement project scaffolding
	// - Create base/ directory with sample schema
	// - Create config/ directory with sample config
	// - Create logic/ directory with sample handler
	// - Create santokit.yaml config file
	return nil
}
