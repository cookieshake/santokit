// Package scanner provides file watching and scanning capabilities.
// It monitors the project directory for changes and triggers rebuilds.
package scanner

import (
	"os"
	"path/filepath"
)

// FileType represents the type of file being scanned
type FileType string

const (
	FileTypeHCL  FileType = "hcl"
	FileTypeYAML FileType = "yaml"
	FileTypeSQL  FileType = "sql"
	FileTypeJS   FileType = "js"
)

// ScannedFile represents a file discovered by the scanner
type ScannedFile struct {
	Path     string
	Type     FileType
	IsPublic bool // false if filename starts with _
}

// Scanner watches and scans project directories
type Scanner struct {
	rootDir string
	baseDir string
	logicDir string
}

// New creates a new Scanner for the given project root
func New(rootDir string) *Scanner {
	return &Scanner{
		rootDir:  rootDir,
		baseDir:  filepath.Join(rootDir, "base"),
		logicDir: filepath.Join(rootDir, "logic"),
	}
}

// ScanBase scans the base/ directory for infrastructure files
func (s *Scanner) ScanBase() ([]ScannedFile, error) {
	return s.scanDir(s.baseDir)
}

// ScanLogic scans the logic/ directory for business logic files
func (s *Scanner) ScanLogic() ([]ScannedFile, error) {
	return s.scanDir(s.logicDir)
}

func (s *Scanner) scanDir(dir string) ([]ScannedFile, error) {
	var files []ScannedFile
	
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		
		ext := filepath.Ext(path)
		var fileType FileType
		
		switch ext {
		case ".hcl":
			fileType = FileTypeHCL
		case ".yaml", ".yml":
			fileType = FileTypeYAML
		case ".sql":
			fileType = FileTypeSQL
		case ".js":
			fileType = FileTypeJS
		default:
			return nil // Skip unknown file types
		}
		
		filename := filepath.Base(path)
		isPublic := filename[0] != '_'
		
		files = append(files, ScannedFile{
			Path:     path,
			Type:     fileType,
			IsPublic: isPublic,
		})
		
		return nil
	})
	
	return files, err
}
