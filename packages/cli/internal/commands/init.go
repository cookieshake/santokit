package commands

import (
	"fmt"
	"os"
	"path/filepath"
)

type InitCmd struct {
	ProjectName string `arg:"" optional:"" help:"Project directory name"`
}

func (c *InitCmd) Run() error {
	projectName := "."
	if c.ProjectName != "" {
		projectName = c.ProjectName
	}

	// 1. Create directories
	dirs := []string{
		filepath.Join(projectName, "schema"),
		filepath.Join(projectName, "config"),
		filepath.Join(projectName, "logic"),
		filepath.Join(projectName, ".stk"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return errorf("❌ Failed to create directory %s: %v", dir, err)
		}
	}

	// 2. Create sample schema
	schemaContent := `table "users" {
  schema = schema.public
  column "id" {
    null = false
    type = uuid
    default = sql("gen_random_uuid()")
  }
  column "email" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
}`
	if err := os.WriteFile(filepath.Join(projectName, "schema", "main.hcl"), []byte(schemaContent), 0644); err != nil {
		return errorf("❌ Failed to create sample schema: %v", err)
	}

	// 3. Create sample config
	authContent := `providers:
  - type: email
    enabled: true
rules:
  - role: "*"
    allow: true
`
	if err := os.WriteFile(filepath.Join(projectName, "config", "auth.yaml"), []byte(authContent), 0644); err != nil {
		return errorf("❌ Failed to create sample config: %v", err)
	}

	// 4. Create sample logic
	logicContent := `---
target: main
access: public
params:
  name:
    type: string
    required: false
    default: "World"
---

export default async function(context) {
  const { name } = context.params;
  return {
    message: "Hello, " + name + "!"
  };
}`
	if err := os.WriteFile(filepath.Join(projectName, "logic", "hello.js"), []byte(logicContent), 0644); err != nil {
		return errorf("❌ Failed to create sample logic: %v", err)
	}

	// 5. Create project config
	configContent := `{
  "project_id": "",
  "codegen": {
    "output": ".stk/santokit-env.d.ts"
  }
}`
	if err := os.WriteFile(filepath.Join(projectName, "stk.config.json"), []byte(configContent), 0644); err != nil {
		return errorf("❌ Failed to create project config: %v", err)
	}

	// 6. Create minimal types placeholder
	typesPath := filepath.Join(projectName, ".stk", "types.d.ts")
	if err := os.WriteFile(typesPath, []byte("import '@santokit/client';\n"), 0644); err != nil {
		return errorf("❌ Failed to create types placeholder: %v", err)
	}

	// 7. Create tsconfig.json (if missing)
	tsconfigPath := filepath.Join(projectName, "tsconfig.json")
	if _, err := os.Stat(tsconfigPath); os.IsNotExist(err) {
		tsconfigContent := `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": [
    "src",
    ".stk/**/*.d.ts"
  ]
}`
		if err := os.WriteFile(tsconfigPath, []byte(tsconfigContent), 0644); err != nil {
			return errorf("❌ Failed to create tsconfig.json: %v", err)
		}
	}

	success(fmt.Sprintf("✅ Initialized Santokit project in %s", projectName))
	info("Next steps:")
	info("1. Set your Project ID in stk.config.json")
	info("2. Run 'stk schema plan' to check database schema")
	info("3. Run 'stk logic apply' to deploy logic")

	return nil
}
