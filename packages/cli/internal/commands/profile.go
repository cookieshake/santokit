package commands

import (
	"fmt"

	"github.com/cookieshake/santokit/packages/cli/internal/userconfig"
	"github.com/spf13/cobra"
)

func NewProfileCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "profile",
		Short: "Manage Hub profiles.",
	}
	cmd.AddCommand(newProfileListCmd())
	cmd.AddCommand(newProfileCurrentCmd())
	cmd.AddCommand(newProfileUseCmd())
	cmd.AddCommand(newProfileSetCmd())
	return cmd
}

func newProfileListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List profiles.",
		RunE: func(cmd *cobra.Command, args []string) error {
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
		},
	}
}

func newProfileCurrentCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "current",
		Short: "Show current profile.",
		RunE: func(cmd *cobra.Command, args []string) error {
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
		},
	}
}

func newProfileUseCmd() *cobra.Command {
	var name string
	cmd := &cobra.Command{
		Use:   "use [name]",
		Short: "Switch current profile.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name = args[0]
			cfg, err := userconfig.Load()
			if err != nil {
				return errorf("❌ Failed to load config: %v", err)
			}

			if _, ok := cfg.Profiles[name]; !ok {
				return errorf("❌ Profile %q not found", name)
			}

			cfg.Current = name
			if err := userconfig.Save(cfg); err != nil {
				return errorf("❌ Failed to save config: %v", err)
			}

			success(fmt.Sprintf("✅ Switched to profile %q", name))
			return nil
		},
	}
	return cmd
}

func newProfileSetCmd() *cobra.Command {
	var name string
	var hubURL string
	var projectID string
	var token string

	cmd := &cobra.Command{
		Use:   "set [name]",
		Short: "Create or update a profile.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name = args[0]
			cfg, err := userconfig.Load()
			if err != nil {
				return errorf("❌ Failed to load config: %v", err)
			}

			profile := cfg.Profiles[name]
			if hubURL != "" {
				profile.HubURL = hubURL
			}
			if projectID != "" {
				profile.ProjectID = projectID
			}
			if token != "" {
				profile.Token = token
			}

			cfg.Profiles[name] = profile
			if cfg.Current == "" {
				cfg.Current = name
			}

			if err := userconfig.Save(cfg); err != nil {
				return errorf("❌ Failed to save config: %v", err)
			}

			success(fmt.Sprintf("✅ Saved profile %q", name))
			return nil
		},
	}
	cmd.Flags().StringVar(&hubURL, "hub-url", "", "Hub URL")
	cmd.Flags().StringVar(&projectID, "project-id", "", "Project ID")
	cmd.Flags().StringVar(&token, "token", "", "Access token")
	return cmd
}
