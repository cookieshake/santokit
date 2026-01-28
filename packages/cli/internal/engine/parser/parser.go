// Package parser handles parsing of various file formats (HCL, YAML, SQL).
// It extracts metadata, validates structure, and prepares content for integration.
package parser

import (
	"fmt"
	"strings"
)

// LogicConfig represents the parsed configuration from a logic file
type LogicConfig struct {
	// Metadata from YAML frontmatter
	Target  string            `yaml:"target"`  // DB alias (e.g., "main", "logs")
	Params  map[string]Param  `yaml:"params"`  // Input parameters
	Access  string            `yaml:"access"`  // "public", "authenticated", "admin"
	Cache   string            `yaml:"cache"`   // Cache duration (e.g., "5m", "1h")
	
	// Parsed content
	Namespace string // Derived from directory structure
	Name      string // Derived from filename
	SQL       string // SQL content (if applicable)
	JS        string // JS content (if applicable)
}

// Param represents a parameter definition
type Param struct {
	Type     string `yaml:"type"`     // "string", "int", "bool", "json"
	Required bool   `yaml:"required"` // Whether the param is required
	Default  any    `yaml:"default"`  // Default value if not required
}

// SchemaConfig represents a parsed HCL schema file
type SchemaConfig struct {
	Alias   string   // DB alias derived from filename
	Tables  []Table  // Parsed table definitions
	Raw     string   // Raw HCL content for Atlas
}

// Table represents a database table definition
type Table struct {
	Name    string
	Columns []Column
}

// Column represents a table column
type Column struct {
	Name     string
	Type     string
	Nullable bool
	Default  string
}

// Parser handles file parsing
type Parser struct{}

// New creates a new Parser
func New() *Parser {
	return &Parser{}
}

// ParseLogicFile parses a logic file (SQL or JS with YAML frontmatter)
func (p *Parser) ParseLogicFile(content string, filename string) (*LogicConfig, error) {
	config := &LogicConfig{}
	
	// Check for YAML frontmatter (starts with ---)
	if strings.HasPrefix(content, "---") {
		parts := strings.SplitN(content, "---", 3)
		if len(parts) >= 3 {
			// TODO: Parse YAML frontmatter from parts[1]
			content = strings.TrimSpace(parts[2])
		}
	}
	
	// Determine content type from filename
	if strings.HasSuffix(filename, ".sql") {
		config.SQL = content
	} else if strings.HasSuffix(filename, ".js") {
		config.JS = content
	}
	
	return config, nil
}

// ParseSchemaFile parses an HCL schema file
func (p *Parser) ParseSchemaFile(content string, filename string) (*SchemaConfig, error) {
	// Derive alias from filename (e.g., "main.hcl" -> "main")
	alias := strings.TrimSuffix(filename, ".hcl")
	
	config := &SchemaConfig{
		Alias: alias,
		Raw:   content,
	}
	
	// TODO: Parse HCL content using hashicorp/hcl
	fmt.Printf("Parsing schema: %s\n", alias)
	
	return config, nil
}
