package commands

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/cookieshake/santokit/packages/cli/internal/engine/communicator"
	"github.com/cookieshake/santokit/packages/cli/internal/engine/integrator"
	"github.com/cookieshake/santokit/packages/cli/internal/engine/parser"
	"github.com/cookieshake/santokit/packages/cli/internal/engine/scanner"
)

type LogicCmd struct {
	Apply    LogicApplyCmd    `cmd:"" help:"Deploy logic changes to Hub." aliases:"push"`
	Validate LogicValidateCmd `cmd:"" help:"Validate logic files without deploying."`
}

type LogicApplyCmd struct{}

func (c *LogicApplyCmd) Run() error {
	rootDir, _ := os.Getwd()
	fmt.Printf("🚀 Starting logic apply from %s...\n", rootDir)

	// 1. Initialize Engines
	scan := scanner.New(rootDir)
	parse := parser.New()
	integrate := integrator.New()

	comm, err := communicator.NewFromEnv()
	if err != nil {
		return errorf("❌ Failed to initialize communicator: %v", err)
	}

	// 2. Scan
	fmt.Println("🔍 Scanning logic files...")
	files, err := scan.ScanLogic()
	if err != nil {
		return errorf("❌ Scan failed: %v", err)
	}
	if len(files) == 0 {
		warn("⚠️  No logic files found.")
		return nil
	}

	// 3. Parse & Bundle
	var bundles []integrator.Bundle
	for _, file := range files {
		fmt.Printf("  • Processing %s...\n", filepath.Base(file.Path))

		content, err := os.ReadFile(file.Path)
		if err != nil {
			return errorf("❌ Failed to read file %s: %v", file.Path, err)
		}

		// Parse
		config, err := parse.ParseLogicFile(string(content), file.Path)
		if err != nil {
			return errorf("❌ Parse failed for %s: %v", file.Path, err)
		}

		// Fill in namespace/name from path if not manually set
		// (Assuming standard structure logic/<namespace>/<name>.<ext>)
		relPath, _ := filepath.Rel(filepath.Join(rootDir, "logic"), file.Path)
		dir, filename := filepath.Split(relPath)
		config.Namespace = filepath.Clean(dir)
		// Remove extension for name
		ext := filepath.Ext(filename)
		config.Name = filename[:len(filename)-len(ext)]

		if err := parser.ValidateLogicConfig(config); err != nil {
			return errorf("❌ Validation failed for %s: %v", file.Path, err)
		}

		// Bundle
		bundle, err := integrate.BundleLogic(config)
		if err != nil {
			return errorf("❌ Bundle failed for %s: %v", file.Path, err)
		}
		bundles = append(bundles, *bundle)
	}

	// 4. Create Manifest
	projectID := comm.Config().ProjectID
	if projectID == "" {
		projectID = os.Getenv("STK_PROJECT_ID")
	}
	if projectID == "" {
		return errorf("❌ STK_PROJECT_ID is required")
	}

	manifest := integrate.CreateManifest(projectID, bundles)

	// 5. Push to Hub
	fmt.Println("☁️  Uploading to Hub...")
	if err := comm.PushManifest(manifest); err != nil {
		return errorf("❌ Apply failed: %v", err)
	}

	success("✅ Successfully deployed logic!")
	return nil
}

type LogicValidateCmd struct{}

func (c *LogicValidateCmd) Run() error {
	fmt.Println("Validating logic files...")
	rootDir, _ := os.Getwd()
	scan := scanner.New(rootDir)
	parse := parser.New()

	files, err := scan.ScanLogic()
	if err != nil {
		return errorf("❌ Scan failed: %v", err)
	}
	if len(files) == 0 {
		warn("⚠️  No logic files found.")
		return nil
	}

	var failed bool
	for _, file := range files {
		content, err := os.ReadFile(file.Path)
		if err != nil {
			fmt.Printf("❌ Failed to read file %s: %v\n", file.Path, err)
			failed = true
			continue
		}

		config, err := parse.ParseLogicFile(string(content), file.Path)
		if err != nil {
			fmt.Printf("❌ Parse failed for %s: %v\n", file.Path, err)
			failed = true
			continue
		}

		relPath, _ := filepath.Rel(filepath.Join(rootDir, "logic"), file.Path)
		dir, filename := filepath.Split(relPath)
		config.Namespace = filepath.Clean(dir)
		ext := filepath.Ext(filename)
		config.Name = filename[:len(filename)-len(ext)]

		if err := parser.ValidateLogicConfig(config); err != nil {
			fmt.Printf("❌ Validation failed for %s: %v\n", file.Path, err)
			failed = true
			continue
		}
	}

	if failed {
		return errorf("❌ Logic validation failed.")
	}
	success("✅ Logic validation passed.")
	return nil
}
