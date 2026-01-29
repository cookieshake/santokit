package commands

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/communicator"
	"github.com/cookieshake/santokit/packages/cli/internal/engine/scanner"
)

type SchemaCmd struct {
	Apply SchemaApplyCmd `cmd:"" help:"Apply schema changes to Hub." aliases:"push"`
	Plan  SchemaPlanCmd  `cmd:"" help:"Preview schema changes without applying."`
}

type SchemaApplyCmd struct {
	Yes bool `help:"Skip confirmation prompt" short:"y"`
}

func (c *SchemaApplyCmd) Run() error {
	title("Schema Apply")
	rootDir, _ := os.Getwd()
	comm, err := communicator.NewFromEnv()
	if err != nil {
		return errorf("❌ Failed to initialize communicator: %v", err)
	}
	schemas, err := loadSchemaFiles(rootDir)
	if err != nil {
		return errorf("❌ Failed to load schema files: %v", err)
	}
	if len(schemas) == 0 {
		warn("⚠️  No schema files found.")
		return nil
	}

	projectID := comm.Config().ProjectID
	if projectID == "" {
		projectID = os.Getenv("STK_PROJECT_ID")
	}
	if projectID == "" {
		return errorf("❌ STK_PROJECT_ID is required")
	}

	plan, err := comm.PlanSchema(projectID, schemas)
	if err != nil {
		return errorf("❌ Schema plan failed: %v", err)
	}

	if !plan.HasChanges || len(plan.Migrations) == 0 {
		success("✅ No schema changes to apply.")
		return nil
	}

	fmt.Printf("Plan: %s\n", plan.Summary)
	fmt.Printf("Migrations: %d\n", len(plan.Migrations))
	if !c.Yes {
		if !confirmPrompt("Apply migrations now? (y/N): ") {
			warn("❎ Aborted.")
			return nil
		}
	}

	if err := comm.ApplySchema(projectID, plan.Migrations); err != nil {
		return errorf("❌ Schema apply failed: %v", err)
	}

	success(fmt.Sprintf("✅ Applied %d migrations.", len(plan.Migrations)))
	return nil
}

type SchemaPlanCmd struct{}

func (c *SchemaPlanCmd) Run() error {
	title("Schema Plan")
	rootDir, _ := os.Getwd()
	comm, err := communicator.NewFromEnv()
	if err != nil {
		return errorf("❌ Failed to initialize communicator: %v", err)
	}
	schemas, err := loadSchemaFiles(rootDir)
	if err != nil {
		return errorf("❌ Failed to load schema files: %v", err)
	}
	if len(schemas) == 0 {
		warn("⚠️  No schema files found.")
		return nil
	}

	projectID := comm.Config().ProjectID
	if projectID == "" {
		projectID = os.Getenv("STK_PROJECT_ID")
	}
	if projectID == "" {
		return errorf("❌ STK_PROJECT_ID is required")
	}

	plan, err := comm.PlanSchema(projectID, schemas)
	if err != nil {
		return errorf("❌ Schema plan failed: %v", err)
	}

	success(fmt.Sprintf("✅ %s", plan.Summary))
	if len(plan.Migrations) > 0 {
		fmt.Printf("Migrations: %d\n", len(plan.Migrations))
	}
	return nil
}

func loadSchemaFiles(rootDir string) (map[string]string, error) {
	scan := scanner.New(rootDir)
	files, err := scan.ScanSchema()
	if err != nil {
		return nil, err
	}

	schemas := make(map[string]string)
	for _, file := range files {
		if filepath.Ext(file.Path) != ".hcl" {
			continue
		}
		content, err := os.ReadFile(file.Path)
		if err != nil {
			return nil, err
		}
		name := filepath.Base(file.Path)
		alias := name[:len(name)-len(filepath.Ext(name))]
		schemas[alias] = string(content)
	}

	return schemas, nil
}

func confirmPrompt(prompt string) bool {
	reader := bufio.NewReader(os.Stdin)
	fmt.Print(prompt)
	input, _ := reader.ReadString('\n')
	input = strings.TrimSpace(strings.ToLower(input))
	return input == "y" || input == "yes"
}
