package main

import (
	"os"

	"github.com/cookieshake/santokit/packages/cli/internal/commands"
)

func main() {
	if err := commands.Execute(); err != nil {
		os.Exit(1)
	}
}
