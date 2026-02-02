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
	title("🚀 Logic Apply")
	info(fmt.Sprintf("Working directory: %s", rootDir))
	fmt.Println()

	// 1. Initialize Engines
	scan := scanner.New(rootDir)
	parse := parser.New()
	integrate := integrator.New()

	comm, err := communicator.NewFromEnv()
	if err != nil {
		return errorf("❌ Failed to initialize communicator: %v", err)
	}

	// 2. Scan
	info("📂 Scanning logic files...")
	files, err := scan.ScanLogic()
	if err != nil {
		return errorf("❌ Scan failed: %v", err)
	}
	if len(files) == 0 {
		warn("⚠️  No logic files found.")
		return nil
	}
	success(fmt.Sprintf("✓ Found %d logic file(s)", len(files)))
	fmt.Println()

	// 3. Parse & Bundle
	info("⚙️  Processing files...")
	configs, err := buildLogicConfigs(rootDir, files, parse)
	if err != nil {
		return err
	}

	var bundles []integrator.Bundle
	for _, config := range configs {
		bundle, err := integrate.BundleLogic(config)
		if err != nil {
			return errorf("❌ Bundle failed for %s/%s: %v", config.Namespace, config.Name, err)
		}
		bundles = append(bundles, *bundle)
	}
	success(fmt.Sprintf("✓ Processed %d file(s)", len(bundles)))
	fmt.Println()

	// 4. Create Manifest
	projectID := comm.Config().ProjectID
	if projectID == "" {
		projectID = os.Getenv("STK_PROJECT_ID")
	}
	if projectID == "" {
		return errorf("❌ STK_PROJECT_ID is required")
	}

	manifest := integrate.CreateManifest(projectID, bundles)
	info(fmt.Sprintf("📦 Created manifest (version: %s)", manifest.Version))
	fmt.Println()

	// 5. Push to Hub
	info("☁️  Uploading to Hub...")
	if err := comm.PushManifest(manifest); err != nil {
		return errorf("❌ Upload failed: %v", err)
	}

	fmt.Println()
	success("✅ Successfully deployed logic!")
	success(fmt.Sprintf("   Project: %s", projectID))
	success(fmt.Sprintf("   Version: %s", manifest.Version))
	success(fmt.Sprintf("   Bundles: %d", len(bundles)))

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

	if _, err := buildLogicConfigs(rootDir, files, parse); err != nil {
		return errorf("❌ Logic validation failed.")
	}
	success("✅ Logic validation passed.")
	return nil
}

type logicEntry struct {
	namespace string
	name      string
	isPublic  bool
	meta      *parser.LogicConfig
	content   *parser.LogicConfig
}

func buildLogicConfigs(rootDir string, files []scanner.ScannedFile, parse *parser.Parser) ([]*parser.LogicConfig, error) {
	entries := make(map[string]*logicEntry)
	logicRoot := filepath.Join(rootDir, "logic")

	for _, file := range files {
		relPath, _ := filepath.Rel(logicRoot, file.Path)
		dir, filename := filepath.Split(relPath)
		ext := filepath.Ext(filename)
		name := filename[:len(filename)-len(ext)]
		namespace := filepath.Clean(dir)
		key := filepath.Join(namespace, name)

		entry, ok := entries[key]
		if !ok {
			entry = &logicEntry{
				namespace: namespace,
				name:      name,
				isPublic:  true,
			}
			entries[key] = entry
		}
		if !file.IsPublic {
			entry.isPublic = false
		}

		content, err := os.ReadFile(file.Path)
		if err != nil {
			return nil, errorf("❌ Failed to read file %s: %v", file.Path, err)
		}

		switch ext {
		case ".yaml", ".yml":
			cfg, err := parse.ParseLogicMetadata(string(content))
			if err != nil {
				return nil, errorf("❌ Parse failed for %s: %v", file.Path, err)
			}
			entry.meta = cfg
		case ".sql", ".js":
			if entry.content != nil {
				return nil, errorf("❌ Multiple logic sources found for %s/%s", entry.namespace, entry.name)
			}
			cfg, err := parse.ParseLogicFile(string(content), file.Path)
			if err != nil {
				return nil, errorf("❌ Parse failed for %s: %v", file.Path, err)
			}
			entry.content = cfg
		}
	}

	var configs []*parser.LogicConfig
	for _, entry := range entries {
		if entry.content == nil {
			return nil, errorf("❌ Missing logic content for %s/%s (expected .sql or .js)", entry.namespace, entry.name)
		}

		config := entry.content
		applyLogicMetadata(config, entry.meta)
		config.Namespace = entry.namespace
		config.Name = entry.name

		if err := parser.ValidateLogicConfig(config); err != nil {
			return nil, errorf("❌ Validation failed for %s/%s: %v", entry.namespace, entry.name, err)
		}

		configs = append(configs, config)
	}

	return configs, nil
}

func applyLogicMetadata(target *parser.LogicConfig, meta *parser.LogicConfig) {
	if meta == nil {
		return
	}
	if meta.Target != "" {
		target.Target = meta.Target
	}
	if meta.Access != "" {
		target.Access = meta.Access
	}
	if meta.Cache != "" {
		target.Cache = meta.Cache
	}
	if meta.Params != nil {
		target.Params = meta.Params
	}
}
