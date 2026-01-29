// Package console provides the Web Console API for the Hub.
// It serves the admin dashboard and provides APIs for monitoring and management.
package console

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/cookieshake/santokit/packages/hub/internal/projects"
)

// DashboardStats represents overview statistics
type DashboardStats struct {
	TotalProjects    int       `json:"total_projects"`
	TotalDeployments int       `json:"total_deployments"`
	ActiveUsers      int       `json:"active_users"`
	LastDeployment   time.Time `json:"last_deployment"`
}

// Project represents a project in the console.
type Project = projects.Project

// Team represents a team/organization.
type Team = projects.Team

// Member represents a team member.
type Member = projects.Member

// Service provides console operations.
type Service struct {
	projects *projects.Service
}

// NewService creates a new console service.
func NewService(projectsService *projects.Service) *Service {
	return &Service{projects: projectsService}
}

// HandleGetStats returns dashboard statistics
func (s *Service) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	if s.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	totalProjects, totalDeployments, activeUsers, lastDeployment := s.projects.Stats(r.Context(), userID)
	stats := DashboardStats{
		TotalProjects:    totalProjects,
		TotalDeployments: totalDeployments,
		ActiveUsers:      activeUsers,
		LastDeployment:   lastDeployment,
	}

	json.NewEncoder(w).Encode(stats)
}

// HandleListProjects returns all projects for a team
func (s *Service) HandleListProjects(w http.ResponseWriter, r *http.Request) {
	if s.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	teamID := strings.TrimSpace(r.URL.Query().Get("team_id"))
	list, err := s.projects.ListProjects(r.Context(), userID, teamID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(list)
}

// HandleGetProject returns a single project
func (s *Service) HandleGetProject(w http.ResponseWriter, r *http.Request) {
	if s.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	projectID := strings.TrimSpace(r.URL.Query().Get("id"))
	if projectID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	project, err := s.projects.GetProject(r.Context(), projectID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(project)
}

// HandleListTeams returns all teams for a user
func (s *Service) HandleListTeams(w http.ResponseWriter, r *http.Request) {
	if s.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	userID := strings.TrimSpace(r.URL.Query().Get("user_id"))
	teams, err := s.projects.ListTeams(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(teams)
}

// HandleInviteMember invites a new team member
func (s *Service) HandleInviteMember(w http.ResponseWriter, r *http.Request) {
	if s.projects == nil {
		http.Error(w, "projects service not configured", http.StatusInternalServerError)
		return
	}

	var req struct {
		TeamID string `json:"team_id"`
		UserID string `json:"user_id"`
		Email  string `json:"email"`
		Role   string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	member, err := s.projects.InviteMember(r.Context(), req.TeamID, req.UserID, req.Email, req.Role)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(member)
}
