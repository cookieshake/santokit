/** @jsxImportSource hono/jsx */
import { Hono } from 'hono'
import { projectService } from '@/modules/project/project.service.js'
import { dataSourceService } from '@/modules/datasource/datasource.service.js'
import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { arrayContains } from 'drizzle-orm'

const app = new Hono()

const Layout = (props: { title: string; children: any; active: string }) => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{props.title} | Santoki Admin</title>
            <link rel="stylesheet" href="/assets/admin-ui.css" />
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/inter-ui@3.19.3/inter.css" />
        </head>
        <body>
            <div class="layout">
                <aside class="sidebar">
                    <div class="sidebar-logo">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        Santoki
                    </div>
                    <nav class="nav">
                        <a href="/admin/_" class={`nav-link ${props.active === 'dashboard' ? 'active' : ''}`}>Dashboard</a>
                        <a href="/admin/_/projects" class={`nav-link ${props.active === 'projects' ? 'active' : ''}`}>Projects</a>
                        <a href="/admin/_/sources" class={`nav-link ${props.active === 'sources' ? 'active' : ''}`}>Data Sources</a>
                        <a href="/admin/_/admins" class={`nav-link ${props.active === 'admins' ? 'active' : ''}`}>Admins</a>
                    </nav>
                </aside>
                <main class="main">
                    {props.children}
                </main>
            </div>
        </body>
    </html>
)

app.get('/login', (c) => {
    return c.html(
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Login | Santoki Admin</title>
                <link rel="stylesheet" href="/assets/admin-ui.css" />
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/inter-ui@3.19.3/inter.css" />
            </head>
            <body style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--background)' }}>
                <div class="card" style={{ width: '100%', maxWidth: '400px' }}>
                    <div class="sidebar-logo" style={{ marginBottom: '2rem', justifyContent: 'center' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        Santoki
                    </div>
                    <h1 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.5rem' }}>Admin Login</h1>
                    <form id="login-form">
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" id="email" class="form-input" placeholder="admin@example.com" required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password</label>
                            <input type="password" id="password" class="form-input" placeholder="••••••••" required />
                        </div>
                        <button type="submit" class="btn" style={{ width: '100%', justifyContent: 'center' }}>Sign In</button>
                    </form>
                    <div id="error-message" style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', display: 'none' }}></div>

                    <script dangerouslySetInnerHTML={{
                        __html: `
            const form = document.getElementById('login-form');
            const errorDiv = document.getElementById('error-message');
            
            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              errorDiv.style.display = 'none';
              
              const email = document.getElementById('email').value;
              const password = document.getElementById('password').value;
              
              try {
                const res = await fetch('/admin/v1/auth/sign-in/email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password })
                });
                
                if (res.ok) {
                  window.location.href = '/admin/_';
                } else {
                  const data = await res.json();
                  errorDiv.textContent = data.message || 'Login failed';
                  errorDiv.style.display = 'block';
                }
              } catch (err) {
                errorDiv.textContent = 'An error occurred';
                errorDiv.style.display = 'block';
              }
            });
          `}} />
                </div>
            </body>
        </html>
    )
})

app.get('/', async (c) => {
    const [projects, sources, admins] = await Promise.all([
        projectService.list(),
        dataSourceService.list(),
        db.select().from(users).where(arrayContains(users.roles, ['admin']))
    ])

    return c.html(
        <Layout title="Dashboard" active="dashboard">
            <div class="header">
                <h1>Dashboard</h1>
            </div>
            <div class="grid">
                <div class="card">
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Total Projects</h3>
                    <p style={{ fontSize: '2.5rem', fontWeight: '800' }}>{projects.length}</p>
                </div>
                <div class="card">
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Data Sources</h3>
                    <p style={{ fontSize: '2.5rem', fontWeight: '800' }}>{sources.length}</p>
                </div>
                <div class="card">
                    <h3 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Active Admins</h3>
                    <p style={{ fontSize: '2.5rem', fontWeight: '800' }}>{admins.length}</p>
                </div>
            </div>

            <div class="card">
                <h2 style={{ marginBottom: '1.5rem' }}>Recent Projects</h2>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Owner ID</th>
                            <th>Created At</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.slice(0, 5).map(p => (
                            <tr>
                                <td>{p.name}</td>
                                <td style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{p.ownerId}</td>
                                <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}</td>
                                <td><span class="badge">Active</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {projects.length > 5 && (
                    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                        <a href="/admin/_/projects" class="btn btn-secondary">View All Projects</a>
                    </div>
                )}
            </div>
        </Layout>
    )
})

app.get('/projects', async (c) => {
    const projects = await projectService.list()
    return c.html(
        <Layout title="Projects" active="projects">
            <div class="header">
                <h1>Projects</h1>
                <button class="btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    New Project
                </button>
            </div>
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Owner</th>
                            <th>Data Source</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map(p => (
                            <tr>
                                <td>{p.id}</td>
                                <td><strong>{p.name}</strong></td>
                                <td>{p.ownerId}</td>
                                <td>{p.dataSourceId || <span style={{ color: 'var(--text-muted)' }}>None</span>}</td>
                                <td>
                                    <a href={`/admin/_/projects/${p.id}`} class="btn btn-secondary">Manage</a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Layout>
    )
})

app.get('/sources', async (c) => {
    const sources = await dataSourceService.list()
    return c.html(
        <Layout title="Data Sources" active="sources">
            <div class="header">
                <h1>Data Sources</h1>
                <button class="btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Add Source
                </button>
            </div>
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Prefix</th>
                            <th>Created At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sources.map(s => (
                            <tr>
                                <td>{s.id}</td>
                                <td><strong>{s.name}</strong></td>
                                <td><code>{s.prefix}</code></td>
                                <td>{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Layout>
    )
})

export default app
