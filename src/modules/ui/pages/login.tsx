/** @jsxImportSource hono/jsx */

export const Login = () => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Login | Santoki Admin</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css" />
        </head>
        <body class="hero is-fullheight is-light">
            <div class="hero-body">
                <div class="container">
                    <div class="columns is-centered">
                        <div class="column is-4">
                            <div class="box">
                                <div class="has-text-centered mb-5">
                                    <h1 class="title is-3">Santoki Admin</h1>
                                    <p class="subtitle is-6">Sign in to your account</p>
                                </div>
                                <form id="login-form">
                                    <div class="field">
                                        <label class="label">Email</label>
                                        <div class="control">
                                            <input class="input" type="email" id="email" placeholder="admin@example.com" required />
                                        </div>
                                    </div>
                                    <div class="field">
                                        <label class="label">Password</label>
                                        <div class="control">
                                            <input class="input" type="password" id="password" placeholder="••••••••" required />
                                        </div>
                                    </div>
                                    <div class="field">
                                        <div class="control">
                                            <button type="submit" class="button is-primary is-fullwidth">Sign In</button>
                                        </div>
                                    </div>
                                </form>
                                <div id="error-message" class="notification is-danger mt-4" style="display: none;">
                                    <span id="error-text"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <script dangerouslySetInnerHTML={{
                __html: `
                const form = document.getElementById('login-form');
                const errorDiv = document.getElementById('error-message');
                const errorText = document.getElementById('error-text');
                
                form.addEventListener('submit', async (e) => {
                  e.preventDefault();
                  errorDiv.style.display = 'none';
                  
                  const email = document.getElementById('email').value;
                  const password = document.getElementById('password').value;
                  
                  try {
                    console.log('Attempting login...');
                    const res = await fetch('/v1/auth/sign-in', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, password })
                    });
                    
                    console.log('Login response status:', res.status);
                    
                    if (res.ok) {
                      console.log('Login successful, redirecting to /ui');
                      window.location.assign('/ui');
                    } else {
                      const data = await res.json();
                      console.error('Login failed:', data);
                      errorText.textContent = data.message || 'Login failed';
                      errorDiv.style.display = 'block';
                    }
                  } catch (err) {
                    console.error('Login error:', err);
                    errorText.textContent = 'An error occurred: ' + err.message;
                    errorDiv.style.display = 'block';
                  }
                });
              `}} />
        </body>
    </html>
)
