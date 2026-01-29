package commands

import (
	"fmt"

	"github.com/cookieshake/santokit/packages/cli/internal/userconfig"
)

type ProfileCmd struct {
	List    ProfileListCmd    `cmd:"" help:"List profiles."`
	Current ProfileCurrentCmd `cmd:"" help:"Show current profile."`
	Use     ProfileUseCmd     `cmd:"" help:"Switch current profile."`
	Set     ProfileSetCmd     `cmd:"" help:"Create or update a profile."`
}

type ProfileListCmd struct{}

func (c *ProfileListCmd) Run() error {
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}

	if len(cfg.Profiles) == 0 {
		warn("No profiles configured.")
		return nil
	}

	title("Profiles")
	fmt.Println(styleHeader.Render(tableRow("NAME", "HUB URL", "PROJECT")))
	for name, profile := range cfg.Profiles {
		current := ""
		if cfg.Current == name {
			current = " (current)"
		}
		fmt.Println(styleCell.Render(tableRow(
			fmt.Sprintf("%s%s", name, current),
			profile.HubURL,
			profile.ProjectID,
		)))
	}
	return nil
}

type ProfileCurrentCmd struct{}

func (c *ProfileCurrentCmd) Run() error {
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

	title("Current Profile")
	fmt.Println(styleHeader.Render(tableRow("NAME", "HUB URL", "PROJECT")))
	fmt.Println(styleCell.Render(tableRow(cfg.Current, profile.HubURL, profile.ProjectID)))
	return nil
}

type ProfileUseCmd struct {
	Name string `arg:"" name:"name"`
}

func (c *ProfileUseCmd) Run() error {
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}

	if _, ok := cfg.Profiles[c.Name]; !ok {
		return errorf("❌ Profile %q not found", c.Name)
	}

	cfg.Current = c.Name
	if err := userconfig.Save(cfg); err != nil {
		return errorf("❌ Failed to save config: %v", err)
	}

	success(fmt.Sprintf("✅ Switched to profile %q", c.Name))
	return nil
}

type ProfileSetCmd struct {
	Name      string `arg:"" name:"name"`
	HubURL    string `help:"Hub URL"`
	ProjectID string `help:"Project ID"`
	Token     string `help:"Access token"`
}

func (c *ProfileSetCmd) Run() error {
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}

	profile := cfg.Profiles[c.Name]
	if c.HubURL != "" {
		profile.HubURL = c.HubURL
	}
	if c.ProjectID != "" {
		profile.ProjectID = c.ProjectID
	}
	if c.Token != "" {
		profile.Token = c.Token
	}

	cfg.Profiles[c.Name] = profile
	if cfg.Current == "" {
		cfg.Current = c.Name
	}

	if err := userconfig.Save(cfg); err != nil {
		return errorf("❌ Failed to save config: %v", err)
	}

	success(fmt.Sprintf("✅ Saved profile %q", c.Name))
	return nil
}
