package commands

import (
	"fmt"

	"github.com/cookieshake/santokit/packages/cli/internal/userconfig"
)

type ProjectCmd struct {
	Info ProjectInfoCmd `cmd:"" help:"Show current project settings."`
	Set  ProjectSetCmd  `cmd:"" help:"Set project ID for the current profile."`
	Auth ProjectAuthCmd `cmd:"" help:"Manage project auth token."`
}

type ProjectInfoCmd struct{}

func (c *ProjectInfoCmd) Run() error {
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}
	if cfg.Current == "" {
		warn("No current profile set.")
		return nil
	}
	profile, ok := cfg.Profiles[cfg.Current]
	if !ok {
		warn("Current profile not found.")
		return nil
	}
	title("Project")
	fmt.Println(styleHeader.Render(tableRow("PROFILE", "HUB URL", "PROJECT")))
	fmt.Println(styleCell.Render(tableRow(cfg.Current, profile.HubURL, profile.ProjectID)))
	fmt.Printf("token: %s\n", maskToken(profile.Token))
	return nil
}

type ProjectSetCmd struct {
	ProjectID string `arg:"" name:"project-id"`
}

func (c *ProjectSetCmd) Run() error {
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}
	if cfg.Current == "" {
		return errorf("❌ No current profile set")
	}
	profile, ok := cfg.Profiles[cfg.Current]
	if !ok {
		return errorf("❌ Current profile not found")
	}
	profile.ProjectID = c.ProjectID
	cfg.Profiles[cfg.Current] = profile
	if err := userconfig.Save(cfg); err != nil {
		return errorf("❌ Failed to save config: %v", err)
	}
	success("✅ Project ID updated")
	return nil
}

type ProjectAuthCmd struct {
	Set  ProjectAuthSetCmd  `cmd:"" help:"Set access token for the current profile."`
	Show ProjectAuthShowCmd `cmd:"" help:"Show access token for the current profile."`
}

type ProjectAuthSetCmd struct {
	Token string `arg:"" name:"token"`
}

func (c *ProjectAuthSetCmd) Run() error {
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}
	if cfg.Current == "" {
		return errorf("❌ No current profile set")
	}
	profile, ok := cfg.Profiles[cfg.Current]
	if !ok {
		return errorf("❌ Current profile not found")
	}
	profile.Token = c.Token
	cfg.Profiles[cfg.Current] = profile
	if err := userconfig.Save(cfg); err != nil {
		return errorf("❌ Failed to save config: %v", err)
	}
	success("✅ Token updated")
	return nil
}

type ProjectAuthShowCmd struct{}

func (c *ProjectAuthShowCmd) Run() error {
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}
	if cfg.Current == "" {
		return errorf("❌ No current profile set")
	}
	profile, ok := cfg.Profiles[cfg.Current]
	if !ok {
		return errorf("❌ Current profile not found")
	}
	fmt.Println(maskToken(profile.Token))
	return nil
}

func maskToken(token string) string {
	if token == "" {
		return ""
	}
	if len(token) <= 8 {
		return "****"
	}
	return token[:4] + "..." + token[len(token)-4:]
}
