package commands

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cookieshake/santoki/packages/cli/internal/engine/communicator"
	"github.com/cookieshake/santoki/packages/cli/internal/engine/integrator"
	"github.com/cookieshake/santoki/packages/cli/internal/engine/parser"
	"github.com/cookieshake/santoki/packages/cli/internal/engine/scanner"
	"github.com/spf13/cobra"
)

var logicCmd = &cobra.Command{
	Use:   "logic",
	Short: "Manage business logic deployment",
	Long:  `Commands for managing business logic files.`,
}

var logicPushCmd = &cobra.Command{
	Use:   "push",
	Short: "Deploy logic changes to Hub",
	Long: `Push business logic changes to Santoki Hub.

This command will:
  - Scan logic/ directory for .sql, .js, .yaml files
  - Parse YAML frontmatter and validate configurations
  - Bundle JS files (no external dependencies allowed)
  - Upload to Hub for provisioning to Edge`,
	Run: func(cmd *cobra.Command, args []string) {
		rootDir, _ := os.Getwd()
		fmt.Printf("🚀 Starting logic push from %s...\n", rootDir)

		// 1. Initialize Engines
		scan := scanner.New(rootDir)
		parse := parser.New()
		integrate := integrator.New()
		
		comm, err := communicator.NewFromEnv()
		if err != nil {
			fmt.Printf("❌ Failed to initialize communicator: %v\n", err)
			os.Exit(1)
		}

		// 2. Scan
		fmt.Println("🔍 Scanning logic files...")
		files, err := scan.ScanLogic()
		if err != nil {
			fmt.Printf("❌ Scan failed: %v\n", err)
			os.Exit(1)
		}
		if len(files) == 0 {
			fmt.Println("⚠️  No logic files found.")
			return
		}

		// 3. Parse & Bundle
		var bundles []integrator.Bundle
		for _, file := range files {
			fmt.Printf("  • Processing %s...\n", filepath.Base(file.Path))
			
			content, err := os.ReadFile(file.Path)
			if err != nil {
				fmt.Printf("❌ Failed to read file %s: %v\n", file.Path, err)
				os.Exit(1)
			}

			// Parse
			config, err := parse.ParseLogicFile(string(content), file.Path)
			if err != nil {
				fmt.Printf("❌ Parse failed for %s: %v\n", file.Path, err)
				os.Exit(1)
			}
			
			// Fill in namespace/name from path if not manually set
			// (Assuming standard structure logic/<namespace>/<name>.<ext>)
			relPath, _ := filepath.Rel(filepath.Join(rootDir, "logic"), file.Path)
			dir, filename := filepath.Split(relPath)
			config.Namespace = filepath.Clean(dir)
			// Remove extension for name
			ext := filepath.Ext(filename)
			config.Name = filename[:len(filename)-len(ext)]

			// Bundle
			bundle, err := integrate.BundleLogic(config)
			if err != nil {
				fmt.Printf("❌ Bundle failed for %s: %v\n", file.Path, err)
				os.Exit(1)
			}
			bundles = append(bundles, *bundle)
		}

		// 4. Create Manifest
		// TODO: Get real project ID
		projectID := "default"
		if commConfigID := os.Getenv("STK_PROJECT_ID"); commConfigID != "" {
			projectID = commConfigID
		}
		
		manifest := integrate.CreateManifest(projectID, bundles)

		// 5. Push to Hub
		fmt.Println("☁️  Uploading to Hub...")
		if err := comm.PushManifest(manifest); err != nil {
			fmt.Printf("❌ Push failed: %v\n", err)
			os.Exit(1)
		}

		fmt.Println("✅ Successfully deployed logic!")
	},
}

var logicValidateCmd = &cobra.Command{
	Use:   "validate",
	Short: "Validate logic files without deploying",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Validating logic files...")
		// TODO: Implement logic validation
	},
}

func init() {
	logicCmd.AddCommand(logicPushCmd)
	logicCmd.AddCommand(logicValidateCmd)
}
