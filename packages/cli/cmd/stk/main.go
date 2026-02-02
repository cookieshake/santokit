package main

import (
	"fmt"
	"os"

	"github.com/cookieshake/santokit/packages/cli/internal/commands"
)

func main() {
	if err := commands.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
