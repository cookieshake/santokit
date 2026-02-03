package commands

import (
	"fmt"

	"github.com/cookieshake/santokit/packages/cli/internal/userconfig"
	"github.com/spf13/cobra"
)

func NewProjectCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "project",
		Short: "Manage project settings.",
	}
	cmd.AddCommand(newProjectInfoCmd())
	cmd.AddCommand(newProjectSetCmd())
	cmd.AddCommand(newProjectAuthCmd())
	return cmd
}

func newProjectInfoCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "info",
		Short: "Show current project settings.",
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
			title("Project")
			fmt.Println(styleHeader.Render(tableRow("PROFILE", "HUB URL", "PROJECT")))
			fmt.Println(styleCell.Render(tableRow(cfg.Current, profile.HubURL, profile.ProjectID)))
			fmt.Printf("token: %s\n", maskToken(profile.Token))
			return nil
		},
	}
}

func newProjectSetCmd() *cobra.Command {
	var projectID string
	cmd := &cobra.Command{
		Use:   "set [project-id]",
		Short: "Set project ID for the current profile.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			projectID = args[0]
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
			profile.ProjectID = projectID
			cfg.Profiles[cfg.Current] = profile
			if err := userconfig.Save(cfg); err != nil {
				return errorf("❌ Failed to save config: %v", err)
			}
			success("✅ Project ID updated")
			return nil
		},
	}
	return cmd
}

func newProjectAuthCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "auth",
		Short: "Manage project auth token.",
	}
	cmd.AddCommand(newProjectAuthSetCmd())
	cmd.AddCommand(newProjectAuthShowCmd())
	return cmd
}

func newProjectAuthSetCmd() *cobra.Command {
	var token string
	cmd := &cobra.Command{
		Use:   "set [token]",
		Short: "Set access token for the current profile.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			token = args[0]
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
			profile.Token = token
			cfg.Profiles[cfg.Current] = profile
			if err := userconfig.Save(cfg); err != nil {
				return errorf("❌ Failed to save config: %v", err)
			}
			success("✅ Token updated")
			return nil
		},
	}
	return cmd
}

func newProjectAuthShowCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "show",
		Short: "Show access token for the current profile.",
		RunE: func(cmd *cobra.Command, args []string) error {
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
		},
	}
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
