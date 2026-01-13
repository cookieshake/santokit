/** @jsxImportSource hono/jsx */
import { Hono } from 'hono'
import { projectService } from '@/modules/project/project.service.js'
import { dataSourceService } from '@/modules/datasource/datasource.service.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { dataService } from '@/modules/data/data.service.js'
import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { arrayContains } from 'drizzle-orm'

const app = new Hono<{
    Variables: {
        user: any;
    };
}>()

const Layout = (props: { title: string; children: any; active: string; user?: any }) => (
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

            {/* Modal Templates will be injected here if needed */}
            <div id="modal-container"></div>

            <script dangerouslySetInnerHTML={{
                __html: `
                function showModal(id) {
                    document.getElementById(id).classList.add('active');
                }
                function hideModal(id) {
                    document.getElementById(id).classList.remove('active');
                }
                window.onclick = function(event) {
                    if (event.target.classList.contains('modal-overlay')) {
                        event.target.classList.remove('active');
                    }
                }
            `}} />
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
                            <th>Created At</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.slice(0, 5).map(p => (
                            <tr>
                                <td>{p.name}</td>
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
    const [projects, sources] = await Promise.all([
        projectService.list(),
        dataSourceService.list()
    ])
    const user = c.get('user')
    return c.html(
        <Layout title="Projects" active="projects" user={user}>
            <div class="header">
                <h1>Projects</h1>
                <button class="btn" onclick="showModal('new-project-modal')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    New Project
                </button>
            </div>

            <div id="new-project-modal" class="modal-overlay">
                <div class="modal">
                    <button class="modal-close" onclick="hideModal('new-project-modal')">✕</button>
                    <h2 class="modal-title">Create New Project</h2>
                    <form id="new-project-form">
                        <div class="form-group">
                            <label class="form-label">Project Name</label>
                            <input type="text" id="project-name" class="form-input" placeholder="My Awesome Project" required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Data Source</label>
                            <select id="project-source" class="form-input" required>
                                {sources.length === 0 ? (
                                    <option value="" disabled selected>No data sources available. Please create one first.</option>
                                ) : (
                                    <>
                                        <option value="" disabled selected>Select a data source</option>
                                        {sources.map(s => (
                                            <option value={s.id}>{s.name} ({s.prefix})</option>
                                        ))}
                                    </>
                                )}
                            </select>
                        </div>
                        <button type="submit" class="btn" style={{ width: '100%', justifyContent: 'center' }}>Create Project</button>
                    </form>
                    <div id="project-error" style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', display: 'none' }}></div>
                </div>
            </div>

            <script dangerouslySetInnerHTML={{
                __html: `
                document.getElementById('new-project-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('project-name').value;
                    const dataSourceId = document.getElementById('project-source').value;
                    const errorDiv = document.getElementById('project-error');
                    errorDiv.style.display = 'none';
                    try {
                        const body = { 
                            name, 
                            dataSourceId: parseInt(dataSourceId) 
                        };

                        if (isNaN(body.dataSourceId)) {
                            errorDiv.textContent = 'Please select a data source';
                            errorDiv.style.display = 'block';
                            return;
                        }

                        const res = await fetch('/admin/v1/projects', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        if (res.ok) {
                            window.location.reload();
                        } else {
                            const data = await res.json();
                            errorDiv.textContent = data.error || 'Failed to create project';
                            errorDiv.style.display = 'block';
                        }
                    } catch (err) {
                        errorDiv.textContent = 'An error occurred';
                        errorDiv.style.display = 'block';
                    }
                });
            `}} />
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Data Source</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map(p => (
                            <tr>
                                <td>{p.id}</td>
                                <td><strong>{p.name}</strong></td>
                                <td>{sources.find(s => s.id === p.dataSourceId)?.name || <span style={{ color: 'var(--text-muted)' }}>None</span>}</td>
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
    const user = c.get('user')
    return c.html(
        <Layout title="Data Sources" active="sources" user={user}>
            <div class="header">
                <h1>Data Sources</h1>
                <button class="btn" onclick="showModal('add-source-modal')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Add Source
                </button>
            </div>

            <div id="add-source-modal" class="modal-overlay">
                <div class="modal">
                    <button class="modal-close" onclick="hideModal('add-source-modal')">✕</button>
                    <h2 class="modal-title">Add Data Source</h2>
                    <form id="add-source-form">
                        <div class="form-group">
                            <label class="form-label">Source Name</label>
                            <input type="text" id="source-name" class="form-input" placeholder="Primary DB" required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Connection String</label>
                            <input type="text" id="source-conn" class="form-input" placeholder="postgres://..." required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Table Prefix</label>
                            <input type="text" id="source-prefix" class="form-input" value="santoki_" required />
                        </div>
                        <button type="submit" class="btn" style={{ width: '100%', justifyContent: 'center' }}>Add Source</button>
                    </form>
                    <div id="source-error" style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', display: 'none' }}></div>
                </div>
            </div>

            <script dangerouslySetInnerHTML={{
                __html: `
                document.getElementById('add-source-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('source-name').value;
                    const connectionString = document.getElementById('source-conn').value;
                    const prefix = document.getElementById('source-prefix').value;
                    const errorDiv = document.getElementById('source-error');
                    errorDiv.style.display = 'none';

                    try {
                        const res = await fetch('/admin/v1/sources', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, connectionString, prefix })
                        });
                        if (res.ok) {
                            window.location.reload();
                        } else {
                            const data = await res.json();
                            errorDiv.textContent = data.error || 'Failed to add data source';
                            errorDiv.style.display = 'block';
                        }
                    } catch (err) {
                        errorDiv.textContent = 'An error occurred';
                        errorDiv.style.display = 'block';
                    }
                });
            `}} />
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

app.get('/projects/:id', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const project = await projectService.getById(projectId)
    if (!project) return c.notFound()

    const collections = await collectionService.listByProject(projectId)
    const user = c.get('user')

    return c.html(
        <Layout title={`Project: ${project.name}`} active="projects" user={user}>
            <div class="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <a href="/admin/_/projects" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    </a>
                    <h1>{project.name}</h1>
                </div>
                <button class="btn" onclick="showModal('new-collection-modal')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    New Collection
                </button>
            </div>

            <div id="new-collection-modal" class="modal-overlay">
                <div class="modal">
                    <button class="modal-close" onclick="hideModal('new-collection-modal')">✕</button>
                    <h2 class="modal-title">Create New Collection</h2>
                    <form id="new-collection-form">
                        <div class="form-group">
                            <label class="form-label">Collection Name</label>
                            <input type="text" id="collection-name" class="form-input" placeholder="posts" required />
                        </div>
                        <button type="submit" class="btn" style={{ width: '100%', justifyContent: 'center' }}>Create Collection</button>
                    </form>
                    <div id="collection-error" style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', display: 'none' }}></div>
                </div>
            </div>

            <script dangerouslySetInnerHTML={{
                __html: `
                document.getElementById('new-collection-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('collection-name').value;
                    const errorDiv = document.getElementById('collection-error');
                    errorDiv.style.display = 'none';

                    try {
                        const res = await fetch('/admin/v1/projects/${projectId}/collections', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name })
                        });
                        if (res.ok) {
                            window.location.reload();
                        } else {
                            const data = await res.json();
                            errorDiv.textContent = data.error || data.details || 'Failed to create collection';
                            errorDiv.style.display = 'block';
                        }
                    } catch (err) {
                        errorDiv.textContent = 'An error occurred';
                        errorDiv.style.display = 'block';
                    }
                });
            `}} />

            <div class="grid">
                <div class="card" style={{ gridColumn: 'span 2' }}>
                    <h2 style={{ marginBottom: '1.5rem' }}>Collections</h2>
                    {collections.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <p>No collections yet. Create your first one!</p>
                        </div>
                    ) : (
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Physical Name</th>
                                    <th>Created At</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {collections.map(col => (
                                    <tr>
                                        <td><strong>{col.name}</strong></td>
                                        <td><code>{col.physicalName}</code></td>
                                        <td>{col.createdAt ? new Date(col.createdAt).toLocaleDateString() : '-'}</td>
                                        <td>
                                            <a href={`/admin/_/projects/${projectId}/collections/${col.name}`} class="btn btn-secondary">Design</a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div class="card">
                    <h2 style={{ marginBottom: '1.5rem' }}>Details</h2>
                    <div class="form-group">
                        <label class="form-label">Project ID</label>
                        <div class="form-input" style={{ background: 'transparent' }}>{project.id}</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Data Source ID</label>
                        <div class="form-input" style={{ background: 'transparent' }}>{project.dataSourceId}</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Created At</label>
                        <div class="form-input" style={{ background: 'transparent' }}>{project.createdAt ? new Date(project.createdAt).toLocaleString() : '-'}</div>
                    </div>
                </div>
            </div>
        </Layout>
    )
})

app.get('/projects/:id/collections/:colName', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const collectionName = c.req.param('colName')
    const user = c.get('user')

    try {
        const detail = await collectionService.getDetail(projectId, collectionName)
        const rows = (await dataService.findAll(projectId, collectionName)) as any[]

        return c.html(
            <Layout title={`Collection: ${collectionName}`} active="projects" user={user}>
                <div class="header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <a href={`/admin/_/projects/${projectId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </a>
                        <h1>{collectionName}</h1>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button class="btn btn-secondary" onclick="showModal('add-row-modal')">Insert Data</button>
                        <button class="btn btn-secondary" onclick="showModal('add-field-modal')">Add Field</button>
                    </div>
                </div>

                <div id="add-row-modal" class="modal-overlay">
                    <div class="modal">
                        <button class="modal-close" onclick="hideModal('add-row-modal')">✕</button>
                        <h2 class="modal-title">Insert New Record</h2>
                        <form id="add-row-form">
                            {detail.fields.filter(f => f.column_name !== 'id' && f.column_name !== 'created_at' && f.column_name !== 'updated_at').map(field => (
                                <div class="form-group">
                                    <label class="form-label">{(field as any).column_name} ({(field as any).data_type})</label>
                                    <input type="text" name={(field as any).column_name} class="form-input" placeholder={`Enter ${(field as any).column_name}`} />
                                </div>
                            ))}
                            <button type="submit" class="btn" style={{ width: '100%', justifyContent: 'center' }}>Insert Record</button>
                        </form>
                        <div id="row-error" style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', display: 'none' }}></div>
                    </div>
                </div>

                <div id="add-field-modal" class="modal-overlay">
                    <div class="modal">
                        <button class="modal-close" onclick="hideModal('add-field-modal')">✕</button>
                        <h2 class="modal-title">Add New Field</h2>
                        <form id="add-field-form">
                            <div class="form-group">
                                <label class="form-label">Field Name</label>
                                <input type="text" id="field-name" class="form-input" placeholder="title" required />
                            </div>
                            <div class="form-group">
                                <label class="form-label">Type</label>
                                <select id="field-type" class="form-input">
                                    <option value="text">Text</option>
                                    <option value="integer">Integer</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="timestamp">Timestamp</option>
                                    <option value="jsonb">JSONB</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input type="checkbox" id="field-nullable" checked />
                                    <span class="form-label" style={{ marginBottom: 0 }}>Nullable</span>
                                </label>
                            </div>
                            <button type="submit" class="btn" style={{ width: '100%', justifyContent: 'center' }}>Add Field</button>
                        </form>
                        <div id="field-error" style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', display: 'none' }}></div>
                    </div>
                </div>

                <script dangerouslySetInnerHTML={{
                    __html: `
                    document.getElementById('add-row-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        const data = {};
                        formData.forEach((value, key) => { data[key] = value; });
                        const errorDiv = document.getElementById('row-error');
                        errorDiv.style.display = 'none';

                        try {
                            const res = await fetch('/admin/v1/projects/${projectId}/collections/${collectionName}/data', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(data)
                            });
                            if (res.ok) {
                                window.location.reload();
                            } else {
                                const errData = await res.json();
                                errorDiv.textContent = errData.error || 'Failed to insert data';
                                errorDiv.style.display = 'block';
                            }
                        } catch (err) {
                            errorDiv.textContent = 'An error occurred';
                            errorDiv.style.display = 'block';
                        }
                    });

                    document.getElementById('add-field-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const name = document.getElementById('field-name').value;
                        const type = document.getElementById('field-type').value;
                        const isNullable = document.getElementById('field-nullable').checked;
                        const errorDiv = document.getElementById('field-error');
                        errorDiv.style.display = 'none';

                        try {
                            const res = await fetch('/admin/v1/projects/${projectId}/collections/${collectionName}/fields', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name, type, isNullable })
                            });
                            if (res.ok) {
                                window.location.reload();
                            } else {
                                const data = await res.json();
                                errorDiv.textContent = data.error || data.details || 'Failed to add field';
                                errorDiv.style.display = 'block';
                            }
                        } catch (err) {
                            errorDiv.textContent = 'An error occurred';
                            errorDiv.style.display = 'block';
                        }
                    });

                    async function deleteField(fieldName) {
                        if (!confirm('Are you sure you want to delete this field?')) return;
                        try {
                            const res = await fetch('/admin/v1/projects/${projectId}/collections/${collectionName}/fields/' + fieldName, {
                                method: 'DELETE'
                            });
                            if (res.ok) {
                                window.location.reload();
                            } else {
                                alert('Failed to delete field');
                            }
                        } catch (err) {
                            alert('An error occurred');
                        }
                    }
                `}} />

                <div class="grid">
                    <div class="card" style={{ gridColumn: 'span 3' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Data Rows</h2>
                        {rows.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                <p>No data yet.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table class="table">
                                    <thead>
                                        <tr>
                                            {detail.fields.map(f => (
                                                <th>{(f as any).column_name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(row => (
                                            <tr>
                                                {detail.fields.map(f => (
                                                    <td>
                                                        {row[(f as any).column_name] === null ? <span style={{ color: 'var(--text-muted)' }}>NULL</span> :
                                                            typeof row[(f as any).column_name] === 'object' ? JSON.stringify(row[(f as any).column_name]) :
                                                                String(row[(f as any).column_name])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div class="grid">
                    <div class="card" style={{ gridColumn: 'span 2' }}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Fields</h2>
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Nullable</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detail.fields.map(field => (
                                    <tr>
                                        <td><strong>{field.column_name}</strong></td>
                                        <td><code>{field.data_type}</code></td>
                                        <td>{field.is_nullable === 'YES' ? '✅' : '❌'}</td>
                                        <td>
                                            <button onclick={`deleteField('${field.column_name}')`} class="btn btn-secondary" style={{ color: '#ef4444' }}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div class="card">
                        <h2 style={{ marginBottom: '1.5rem' }}>Indexes</h2>
                        {detail.indexes.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No indexes found.</p>
                        ) : (
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                {detail.indexes.map(idx => (
                                    <li style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
                                        <div style={{ fontWeight: 600 }}>{idx.indexname}</div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}><code>{idx.indexdef}</code></div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </Layout>
        )
    } catch (e) {
        return c.html(<Layout title="Error" active="projects" user={user}><div>Error: {String(e)}</div></Layout>)
    }
})

app.get('/admins', async (c) => {
    const admins = await db.select().from(users).where(arrayContains(users.roles, ['admin']))
    const user = c.get('user')
    return c.html(
        <Layout title="Admins" active="admins" user={user}>
            <div class="header">
                <h1>Administrators</h1>
                <button class="btn" onclick="showModal('invite-admin-modal')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Invite Admin
                </button>
            </div>

            <div id="invite-admin-modal" class="modal-overlay">
                <div class="modal">
                    <button class="modal-close" onclick="hideModal('invite-admin-modal')">✕</button>
                    <h2 class="modal-title">Invite Admin</h2>
                    <form id="invite-admin-form">
                        <div class="form-group">
                            <label class="form-label">Email Address</label>
                            <input type="email" id="admin-email" class="form-input" placeholder="admin@example.com" required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password</label>
                            <input type="password" id="admin-password" class="form-input" placeholder="••••••••" required />
                        </div>
                        <button type="submit" class="btn" style={{ width: '100%', justifyContent: 'center' }}>Create Admin</button>
                    </form>
                    <div id="admin-error" style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.875rem', display: 'none' }}></div>
                </div>
            </div>

            <script dangerouslySetInnerHTML={{
                __html: `
                document.getElementById('invite-admin-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('admin-email').value;
                    const password = document.getElementById('admin-password').value;
                    const errorDiv = document.getElementById('admin-error');
                    errorDiv.style.display = 'none';

                    try {
                        const res = await fetch('/admin/v1/auth/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password, role: 'admin' })
                        });
                        if (res.ok) {
                            window.location.reload();
                        } else {
                            const data = await res.json();
                            errorDiv.textContent = data.error || 'Failed to create admin';
                            errorDiv.style.display = 'block';
                        }
                    } catch (err) {
                        errorDiv.textContent = 'An error occurred';
                        errorDiv.style.display = 'block';
                    }
                });
            `}} />
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Roles</th>
                            <th>Created At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {admins.map(admin => (
                            <tr>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>
                                            {admin.name.charAt(0).toUpperCase()}
                                        </div>
                                        <strong>{admin.name}</strong>
                                    </div>
                                </td>
                                <td>{admin.email}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {admin.roles?.map(role => (
                                            <span class="badge">{role}</span>
                                        ))}
                                    </div>
                                </td>
                                <td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Layout>
    )
})

export default app
