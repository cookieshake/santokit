package projects

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/cookieshake/santokit/packages/hub/internal/store/sqlstore"
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
	MasterKey   string    `json:"-"` // 32-byte encryption key (never exposed in JSON)
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
	db                 *sql.DB
	dialect            string
}

// NewService creates a new in-memory project service.
func NewService() *Service {
	return &Service{
		projects:           make(map[string]Project),
		teams:              make(map[string]Team),
		personalTeamByUser: make(map[string]string),
	}
}

func NewServiceWithDB(db *sql.DB, dialect string) *Service {
	return &Service{
		db:      db,
		dialect: dialect,
	}
}

func (s *Service) CreateProject(ctx context.Context, ownerID, name, description, teamID string) (Project, error) {
	if strings.TrimSpace(name) == "" {
		return Project{}, fmt.Errorf("project name required")
	}
	if strings.TrimSpace(ownerID) == "" {
		return Project{}, fmt.Errorf("owner_id required")
	}
	if s.db != nil {
		return s.createProjectDB(ctx, ownerID, name, description, teamID)
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

	// Generate a secure 32-byte master key for this project
	masterKey, err := generateMasterKey()
	if err != nil {
		return Project{}, fmt.Errorf("failed to generate master key: %w", err)
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
		MasterKey:   masterKey,
	}

	s.projects[project.ID] = project
	return project, nil
}

func (s *Service) GetProject(ctx context.Context, id string) (Project, error) {
	if strings.TrimSpace(id) == "" {
		return Project{}, fmt.Errorf("project id required")
	}
	if s.db != nil {
		return s.getProjectDB(ctx, id)
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
	if s.db != nil {
		return s.listProjectsDB(ctx, userID, teamID)
	}
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
	if s.db != nil {
		return s.createTeamDB(ctx, ownerID, name)
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
	if s.db != nil {
		return s.listTeamsDB(ctx, userID)
	}
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
	if s.db != nil {
		return s.inviteMemberDB(ctx, teamID, userID, email, role)
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
	if s.db != nil {
		return s.statsDB(ctx, userID)
	}
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

// generateMasterKey creates a secure 32-byte encryption key for a project
func generateMasterKey() (string, error) {
	key := make([]byte, 32) // 32 bytes for AES-256
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate random key: %w", err)
	}
	return hex.EncodeToString(key), nil
}

// GetProjectMasterKey retrieves the master encryption key for a project
// This should only be called by trusted internal services
func (s *Service) GetProjectMasterKey(ctx context.Context, projectID string) (string, error) {
	if s.db != nil {
		return s.getProjectMasterKeyDB(ctx, projectID)
	}
	_ = ctx
	s.mu.RLock()
	defer s.mu.RUnlock()

	project, ok := s.projects[projectID]
	if !ok {
		return "", fmt.Errorf("project not found")
	}

	if project.MasterKey == "" {
		return "", fmt.Errorf("project has no master key")
	}

	return project.MasterKey, nil
}

func (s *Service) createProjectDB(ctx context.Context, ownerID, name, description, teamID string) (Project, error) {
	if teamID == "" {
		var err error
		teamID, err = s.ensurePersonalTeamDB(ctx, ownerID)
		if err != nil {
			return Project{}, err
		}
	}

	masterKey, err := generateMasterKey()
	if err != nil {
		return Project{}, fmt.Errorf("failed to generate master key: %w", err)
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
		MasterKey:   masterKey,
	}

	query := sqlstore.Rebind(s.dialect, `INSERT INTO projects
		(id, name, description, created_at, updated_at, team_id, owner_id, master_key)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	_, err = s.db.ExecContext(ctx, query, project.ID, project.Name, project.Description, project.CreatedAt, project.UpdatedAt, project.TeamID, project.OwnerID, project.MasterKey)
	if err != nil {
		return Project{}, err
	}

	return project, nil
}

func (s *Service) getProjectDB(ctx context.Context, id string) (Project, error) {
	query := sqlstore.Rebind(s.dialect, `SELECT id, name, description, created_at, updated_at, team_id, owner_id, master_key
		FROM projects WHERE id = ? LIMIT 1`)
	var project Project
	if err := s.db.QueryRowContext(ctx, query, id).Scan(
		&project.ID,
		&project.Name,
		&project.Description,
		&project.CreatedAt,
		&project.UpdatedAt,
		&project.TeamID,
		&project.OwnerID,
		&project.MasterKey,
	); err != nil {
		return Project{}, err
	}
	return project, nil
}

func (s *Service) listProjectsDB(ctx context.Context, userID, teamID string) ([]Project, error) {
	var (
		query string
		args  []any
	)

	if userID == "" && teamID == "" {
		query = sqlstore.Rebind(s.dialect, `SELECT id, name, description, created_at, updated_at, team_id, owner_id, master_key FROM projects`)
	} else if userID != "" && teamID == "" {
		query = sqlstore.Rebind(s.dialect, `SELECT DISTINCT p.id, p.name, p.description, p.created_at, p.updated_at, p.team_id, p.owner_id, p.master_key
			FROM projects p
			JOIN team_members m ON m.team_id = p.team_id
			WHERE m.user_id = ?`)
		args = []any{userID}
	} else if userID == "" && teamID != "" {
		query = sqlstore.Rebind(s.dialect, `SELECT id, name, description, created_at, updated_at, team_id, owner_id, master_key FROM projects WHERE team_id = ?`)
		args = []any{teamID}
	} else {
		query = sqlstore.Rebind(s.dialect, `SELECT DISTINCT p.id, p.name, p.description, p.created_at, p.updated_at, p.team_id, p.owner_id, p.master_key
			FROM projects p
			JOIN team_members m ON m.team_id = p.team_id
			WHERE m.user_id = ? AND p.team_id = ?`)
		args = []any{userID, teamID}
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Project
	for rows.Next() {
		var project Project
		if err := rows.Scan(
			&project.ID,
			&project.Name,
			&project.Description,
			&project.CreatedAt,
			&project.UpdatedAt,
			&project.TeamID,
			&project.OwnerID,
			&project.MasterKey,
		); err != nil {
			return nil, err
		}
		out = append(out, project)
	}

	return out, nil
}

func (s *Service) createTeamDB(ctx context.Context, ownerID, name string) (Team, error) {
	team := Team{
		ID:        randomID("team"),
		Name:      name,
		CreatedAt: time.Now(),
		Members: []Member{
			{UserID: ownerID, Role: "owner"},
		},
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Team{}, err
	}
	defer tx.Rollback()

	teamQuery := sqlstore.Rebind(s.dialect, `INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)`)
	if _, err := tx.ExecContext(ctx, teamQuery, team.ID, team.Name, team.CreatedAt); err != nil {
		return Team{}, err
	}

	memberQuery := sqlstore.Rebind(s.dialect, `INSERT INTO team_members (team_id, user_id, email, role) VALUES (?, ?, ?, ?)`)
	if _, err := tx.ExecContext(ctx, memberQuery, team.ID, ownerID, "", "owner"); err != nil {
		return Team{}, err
	}

	if err := tx.Commit(); err != nil {
		return Team{}, err
	}

	return team, nil
}

func (s *Service) listTeamsDB(ctx context.Context, userID string) ([]Team, error) {
	var (
		query string
		args  []any
	)

	if userID == "" {
		query = sqlstore.Rebind(s.dialect, `SELECT id, name, created_at FROM teams`)
	} else {
		query = sqlstore.Rebind(s.dialect, `SELECT DISTINCT t.id, t.name, t.created_at
			FROM teams t
			JOIN team_members m ON m.team_id = t.id
			WHERE m.user_id = ?`)
		args = []any{userID}
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Team
	for rows.Next() {
		var team Team
		if err := rows.Scan(&team.ID, &team.Name, &team.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, team)
	}
	return out, nil
}

func (s *Service) inviteMemberDB(ctx context.Context, teamID, userID, email, role string) (Member, error) {
	role = normalizeRole(role)
	if role == "" {
		return Member{}, fmt.Errorf("invalid role")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Member{}, err
	}
	defer tx.Rollback()

	deleteQuery := sqlstore.Rebind(s.dialect, `DELETE FROM team_members WHERE team_id = ? AND user_id = ? AND email = ?`)
	if _, err := tx.ExecContext(ctx, deleteQuery, teamID, userID, email); err != nil {
		return Member{}, err
	}

	insertQuery := sqlstore.Rebind(s.dialect, `INSERT INTO team_members (team_id, user_id, email, role) VALUES (?, ?, ?, ?)`)
	if _, err := tx.ExecContext(ctx, insertQuery, teamID, userID, email, role); err != nil {
		return Member{}, err
	}

	if err := tx.Commit(); err != nil {
		return Member{}, err
	}

	return Member{
		UserID: userID,
		Email:  email,
		Role:   role,
	}, nil
}

func (s *Service) statsDB(ctx context.Context, userID string) (totalProjects, totalDeployments, activeUsers int, lastDeployment time.Time) {
	if userID == "" {
		row := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects`)
		_ = row.Scan(&totalProjects)
		row = s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT COALESCE(NULLIF(user_id, ''), NULLIF(email, ''))) FROM team_members`)
		_ = row.Scan(&activeUsers)
		return totalProjects, 0, activeUsers, time.Time{}
	}

	projectsQuery := sqlstore.Rebind(s.dialect, `SELECT COUNT(DISTINCT p.id)
		FROM projects p
		JOIN team_members m ON m.team_id = p.team_id
		WHERE m.user_id = ?`)
	_ = s.db.QueryRowContext(ctx, projectsQuery, userID).Scan(&totalProjects)

	usersQuery := sqlstore.Rebind(s.dialect, `SELECT COUNT(DISTINCT COALESCE(NULLIF(m.user_id, ''), NULLIF(m.email, '')))
		FROM team_members m
		JOIN teams t ON t.id = m.team_id
		JOIN team_members me ON me.team_id = t.id
		WHERE me.user_id = ?`)
	_ = s.db.QueryRowContext(ctx, usersQuery, userID).Scan(&activeUsers)

	return totalProjects, 0, activeUsers, time.Time{}
}

func (s *Service) ensurePersonalTeamDB(ctx context.Context, userID string) (string, error) {
	query := sqlstore.Rebind(s.dialect, `SELECT team_id FROM personal_teams WHERE user_id = ? LIMIT 1`)
	var teamID string
	if err := s.db.QueryRowContext(ctx, query, userID).Scan(&teamID); err == nil && teamID != "" {
		return teamID, nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	teamID = randomID("team")
	teamQuery := sqlstore.Rebind(s.dialect, `INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?)`)
	if _, err := tx.ExecContext(ctx, teamQuery, teamID, "Personal", time.Now()); err != nil {
		return "", err
	}

	memberQuery := sqlstore.Rebind(s.dialect, `INSERT INTO team_members (team_id, user_id, email, role) VALUES (?, ?, ?, ?)`)
	if _, err := tx.ExecContext(ctx, memberQuery, teamID, userID, "", "owner"); err != nil {
		return "", err
	}

	mapQuery := sqlstore.Rebind(s.dialect, `INSERT INTO personal_teams (user_id, team_id) VALUES (?, ?)`)
	if _, err := tx.ExecContext(ctx, mapQuery, userID, teamID); err != nil {
		return "", err
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}

	return teamID, nil
}

func (s *Service) getProjectMasterKeyDB(ctx context.Context, projectID string) (string, error) {
	query := sqlstore.Rebind(s.dialect, `SELECT master_key FROM projects WHERE id = ? LIMIT 1`)
	var key string
	if err := s.db.QueryRowContext(ctx, query, projectID).Scan(&key); err != nil {
		return "", err
	}
	if key == "" {
		return "", fmt.Errorf("project has no master key")
	}
	return key, nil
}
