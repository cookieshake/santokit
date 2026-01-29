package commands

import "fmt"

type DevCmd struct {
	Port int `help:"Port to run the dev server on" default:"3000" short:"p"`
}

func (c *DevCmd) Run() error {
	fmt.Println("Starting Santokit development server...")
	// TODO: Implement dev server
	// - Start file watcher (Scanner engine)
	// - Parse files on change (Parser engine)
	// - Bundle and serve locally (Integrator engine)
	_ = c.Port
	return nil
}
