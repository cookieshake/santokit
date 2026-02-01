package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"runtime"
	"time"

	"github.com/cookieshake/santokit/packages/cli/internal/userconfig"
)

type LoginCmd struct {
	HubURL string `help:"Hub URL" default:"https://hub.santokit.dev"`
}

func (c *LoginCmd) Run() error {
	title("Login")

	// 1. Start local callback server
	callbackPort := "8765"
	callbackURL := fmt.Sprintf("http://localhost:%s/callback", callbackPort)

	tokenChan := make(chan string, 1)
	errChan := make(chan error, 1)

	// Create HTTP server for OAuth callback
	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "No token provided", http.StatusBadRequest)
			errChan <- fmt.Errorf("no token in callback")
			return
		}

		// Send success page
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Santokit Login</title>
				<style>
					body {
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						display: flex;
						align-items: center;
						justify-content: center;
						height: 100vh;
						margin: 0;
						background: linear-gradient(135deg, #667eea 0%%, #764ba2 100%%);
					}
					.container {
						background: white;
						padding: 3rem;
						border-radius: 1rem;
						box-shadow: 0 20px 60px rgba(0,0,0,0.3);
						text-align: center;
					}
					h1 { color: #667eea; margin: 0 0 1rem 0; }
					p { color: #666; margin: 0; }
					.success { color: #10b981; font-size: 3rem; margin-bottom: 1rem; }
				</style>
			</head>
			<body>
				<div class="container">
					<div class="success">✓</div>
					<h1>Login Successful!</h1>
					<p>You can close this window and return to your terminal.</p>
				</div>
			</body>
			</html>
		`)

		tokenChan <- token
	})

	server := &http.Server{
		Addr:    ":" + callbackPort,
		Handler: mux,
	}

	// Start server in background
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- fmt.Errorf("callback server error: %w", err)
		}
	}()

	// Give server time to start
	time.Sleep(100 * time.Millisecond)

	// 2. Open browser to Hub login page
	loginURL := fmt.Sprintf("%s/auth/cli?callback=%s", c.HubURL, callbackURL)

	info(fmt.Sprintf("Opening browser to: %s", loginURL))
	info("If the browser doesn't open automatically, please visit the URL above.")

	if err := openBrowser(loginURL); err != nil {
		warn(fmt.Sprintf("Failed to open browser: %v", err))
	}

	// 3. Wait for callback or timeout
	info("Waiting for authentication...")

	var token string
	select {
	case token = <-tokenChan:
		// Success!
	case err := <-errChan:
		return errorf("❌ Authentication failed: %v", err)
	case <-time.After(5 * time.Minute):
		return errorf("❌ Authentication timed out")
	}

	// Shutdown callback server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	server.Shutdown(ctx)

	// 4. Verify token and get user info
	userInfo, err := c.getUserInfo(token)
	if err != nil {
		return errorf("❌ Failed to get user info: %v", err)
	}

	// 5. Save to config
	cfg, err := userconfig.Load()
	if err != nil {
		return errorf("❌ Failed to load config: %v", err)
	}

	profileName := "default"
	cfg.Profiles[profileName] = userconfig.Profile{
		HubURL: c.HubURL,
		Token:  token,
	}
	cfg.Current = profileName

	if err := userconfig.Save(cfg); err != nil {
		return errorf("❌ Failed to save config: %v", err)
	}

	success(fmt.Sprintf("✅ Logged in as %s", userInfo.Email))
	success(fmt.Sprintf("✅ Profile '%s' saved", profileName))

	return nil
}

type userInfoResponse struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
}

func (c *LoginCmd) getUserInfo(token string) (*userInfoResponse, error) {
	req, err := http.NewRequest("GET", c.HubURL+"/api/v1/auth/me", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to get user info: %s", string(body))
	}

	var info userInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}

	return &info, nil
}

func openBrowser(url string) error {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	default: // linux, freebsd, etc.
		cmd = "xdg-open"
		args = []string{url}
	}

	return exec.Command(cmd, args...).Start()
}
