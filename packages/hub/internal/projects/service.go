package projects

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Project represents a project in the Hub.
type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	TeamID      string    `json:"team_id"`
	OwnerID     string    `json:"owner_id"`
}

// Team represents a team/organization.
type Team struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Members   []Member  `json:"members"`
	CreatedAt time.Time `json:"created_at"`
}

// Member represents a team member.
type Member struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"` // "owner", "admin", "member"
}

// Service provides project/team operations (in-memory for now).
type Service struct {
	mu                 sync.RWMutex
	projects           map[string]Project
	teams              map[string]Team
	personalTeamByUser map[string]string
}

// NewService creates a new in-memory project service.
func NewService() *Service {
	return &Service{
		projects:           make(map[string]Project),
		teams:              make(map[string]Team),
		personalTeamByUser: make(map[string]string),
	}
}

func (s *Service) CreateProject(ctx context.Context, ownerID, name, description, teamID string) (Project, error) {
	if strings.TrimSpace(name) == "" {
		return Project{}, fmt.Errorf("project name required")
	}
	if strings.TrimSpace(ownerID) == "" {
		return Project{}, fmt.Errorf("owner_id required")
	}
	_ = ctx

	s.mu.Lock()
	defer s.mu.Unlock()

	if teamID == "" {
		teamID = s.ensurePersonalTeamLocked(ownerID)
	}
	if _, ok := s.teams[teamID]; !ok {
		return Project{}, fmt.Errorf("team not found")
	}

	now := time.Now()
	project := Project{
		ID:          randomID("prj"),
		Name:        name,
		Description: description,
		CreatedAt:   now,
		UpdatedAt:   now,
		TeamID:      teamID,
		OwnerID:     ownerID,
	}

	s.projects[project.ID] = project
	return project, nil
}

func (s *Service) GetProject(ctx context.Context, id string) (Project, error) {
	if strings.TrimSpace(id) == "" {
		return Project{}, fmt.Errorf("project id required")
	}
	_ = ctx

	s.mu.RLock()
	defer s.mu.RUnlock()

	project, ok := s.projects[id]
	if !ok {
		return Project{}, fmt.Errorf("project not found")
	}
	return project, nil
}

func (s *Service) ListProjects(ctx context.Context, userID, teamID string) ([]Project, error) {
	_ = ctx
	s.mu.RLock()
	defer s.mu.RUnlock()

	var out []Project
	for _, project := range s.projects {
		if teamID != "" && project.TeamID != teamID {
			continue
		}
		if userID != "" && !s.isMemberLocked(project.TeamID, userID) {
			continue
		}
		out = append(out, project)
	}
	return out, nil
}

func (s *Service) CreateTeam(ctx context.Context, ownerID, name string) (Team, error) {
	if strings.TrimSpace(ownerID) == "" {
		return Team{}, fmt.Errorf("owner_id required")
	}
	if strings.TrimSpace(name) == "" {
		return Team{}, fmt.Errorf("team name required")
	}
	_ = ctx

	s.mu.Lock()
	defer s.mu.Unlock()

	team := Team{
		ID:        randomID("team"),
		Name:      name,
		CreatedAt: time.Now(),
		Members: []Member{
			{UserID: ownerID, Role: "owner"},
		},
	}

	s.teams[team.ID] = team
	return team, nil
}

func (s *Service) ListTeams(ctx context.Context, userID string) ([]Team, error) {
	_ = ctx
	s.mu.RLock()
	defer s.mu.RUnlock()

	var out []Team
	for _, team := range s.teams {
		if userID != "" && !s.isMemberLocked(team.ID, userID) {
			continue
		}
		out = append(out, team)
	}
	return out, nil
}

func (s *Service) InviteMember(ctx context.Context, teamID, userID, email, role string) (Member, error) {
	if strings.TrimSpace(teamID) == "" {
		return Member{}, fmt.Errorf("team_id required")
	}
	if strings.TrimSpace(userID) == "" && strings.TrimSpace(email) == "" {
		return Member{}, fmt.Errorf("user_id or email required")
	}
	_ = ctx

	role = normalizeRole(role)
	if role == "" {
		return Member{}, fmt.Errorf("invalid role")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	team, ok := s.teams[teamID]
	if !ok {
		return Member{}, fmt.Errorf("team not found")
	}

	member := Member{
		UserID: userID,
		Email:  email,
		Role:   role,
	}

	for i, existing := range team.Members {
		if existing.UserID != "" && existing.UserID == userID {
			team.Members[i] = member
			s.teams[teamID] = team
			return member, nil
		}
		if existing.Email != "" && existing.Email == email {
			team.Members[i] = member
			s.teams[teamID] = team
			return member, nil
		}
	}

	team.Members = append(team.Members, member)
	s.teams[teamID] = team
	return member, nil
}

func (s *Service) Stats(ctx context.Context, userID string) (totalProjects, totalDeployments, activeUsers int, lastDeployment time.Time) {
	_ = ctx
	s.mu.RLock()
	defer s.mu.RUnlock()

	projectCount := 0
	memberSet := map[string]struct{}{}

	for _, project := range s.projects {
		if userID != "" && !s.isMemberLocked(project.TeamID, userID) {
			continue
		}
		projectCount++
	}

	for _, team := range s.teams {
		if userID != "" && !s.isMemberLocked(team.ID, userID) {
			continue
		}
		for _, member := range team.Members {
			key := member.UserID
			if key == "" {
				key = member.Email
			}
			if key != "" {
				memberSet[key] = struct{}{}
			}
		}
	}

	return projectCount, 0, len(memberSet), time.Time{}
}

func (s *Service) ensurePersonalTeamLocked(userID string) string {
	if teamID, ok := s.personalTeamByUser[userID]; ok {
		return teamID
	}

	team := Team{
		ID:        randomID("team"),
		Name:      "Personal",
		CreatedAt: time.Now(),
		Members: []Member{
			{UserID: userID, Role: "owner"},
		},
	}

	s.teams[team.ID] = team
	s.personalTeamByUser[userID] = team.ID
	return team.ID
}

func (s *Service) isMemberLocked(teamID, userID string) bool {
	team, ok := s.teams[teamID]
	if !ok {
		return false
	}
	for _, member := range team.Members {
		if member.UserID == userID {
			return true
		}
	}
	return false
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "owner", "admin", "member":
		return strings.ToLower(strings.TrimSpace(role))
	case "":
		return "member"
	default:
		return ""
	}
}

func randomID(prefix string) string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	}
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(buf))
}
