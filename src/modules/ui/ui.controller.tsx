/** @jsxImportSource hono/jsx */
import { Hono } from 'hono'
import { projectService } from '@/modules/project/project.service.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { dataService } from '@/modules/data/data.service.js'
import { db } from '@/db/index.js'
import { sql } from 'drizzle-orm'

const app = new Hono<{
    Variables: {
        account: any;
    };
}>()

const Layout = (props: { title: string; children: any; active: string; account?: any; projects?: any[]; currentProjectId?: number }) => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{props.title} | Santoki Admin</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css" />
            <script dangerouslySetInnerHTML={{
                __html: `
                function showModal(id) {
                    document.getElementById(id)?.classList.add('is-active');
                }
                function hideModal(id) {
                    document.getElementById(id)?.classList.remove('is-active');
                }
                function toggleDropdown(id) {
                    document.getElementById(id)?.classList.toggle('is-active');
                }
                document.addEventListener('DOMContentLoaded', () => {
                    // Close dropdowns when clicking outside
                    document.addEventListener('click', (e) => {
                        if (!e.target.closest('.dropdown')) {
                            document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('is-active'));
                        }
                    });
                    // Close modals
                    document.querySelectorAll('.modal-background, .modal-close, .delete').forEach(el => {
                        el.addEventListener('click', () => {
                            el.closest('.modal')?.classList.remove('is-active');
                        });
                    });
                });
            `}} />
        </head>
        <body>
            <div class="columns is-gapless">
                <div class="column is-2">
                    <aside class="menu section">
                        <p class="menu-label is-size-4 has-text-link">
                            Santoki
                        </p>
                        <ul class="menu-list">
                            <li><a href="/ui" class={props.active === 'dashboard' ? 'is-active' : ''}>Dashboard</a></li>
                            <li><a href="/ui/projects" class={props.active === 'projects' ? 'is-active' : ''}>Projects</a></li>
                            <li><a href="/ui/admins" class={props.active === 'admins' ? 'is-active' : ''}>Admins</a></li>
                        </ul>
                        {props.account && (
                            <div class="mt-6 pt-5 has-border-top">
                                <div class="media">
                                    <div class="media-left">
                                        <figure class="image is-48x48">
                                            <span class="tag is-link is-large is-rounded">{props.account.email?.charAt(0).toUpperCase()}</span>
                                        </figure>
                                    </div>
                                    <div class="media-content">
                                        <p class="is-size-7 has-text-weight-semibold">{props.account.name || 'Admin'}</p>
                                        <p class="is-size-7 has-text-grey">{props.account.email}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
                <div class="column">
                    <nav class="navbar">
                        <div class="navbar-brand">
                            {props.projects && props.projects.length > 0 && (
                                <div class="navbar-item">
                                    <div class="dropdown" id="project-dropdown">
                                        <div class="dropdown-trigger">
                                            <button class="button" onclick="toggleDropdown('project-dropdown')">
                                                <span>
                                                    {props.currentProjectId
                                                        ? props.projects.find(p => p.id === props.currentProjectId)?.name || 'Select Project'
                                                        : 'Select Project'}
                                                </span>
                                                <span class="icon is-small">
                                                    <i>▼</i>
                                                </span>
                                            </button>
                                        </div>
                                        <div class="dropdown-menu">
                                            <div class="dropdown-content">
                                                {props.projects.map(project => (
                                                    <a
                                                        href={`/ui/projects/${project.id}`}
                                                        class={`dropdown-item ${props.currentProjectId === project.id ? 'is-active' : ''}`}
                                                    >
                                                        <p class="has-text-weight-semibold">{project.name}</p>
                                                        <p class="is-size-7 has-text-grey">ID: {project.id}</p>
                                                    </a>
                                                ))}
                                                <hr class="dropdown-divider" />
                                                <a href="/ui/projects" class="dropdown-item">
                                                    Manage All Projects
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </nav>
                    <section class="section">
                        {props.children}
                    </section>
                </div>
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
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css" />
            </head>
            <body class="hero is-fullheight is-link">
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
                                                <button type="submit" class="button is-link is-fullwidth">Sign In</button>
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
                        const res = await fetch('/v1/auth/sign-in', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email, password })
                        });
                        
                        if (res.ok) {
                          window.location.href = '/ui';
                        } else {
                          const data = await res.json();
                          errorText.textContent = data.message || 'Login failed';
                          errorDiv.style.display = 'block';
                        }
                      } catch (err) {
                        errorText.textContent = 'An error occurred';
                        errorDiv.style.display = 'block';
                      }
                    });
                  `}} />
            </body>
        </html>
    )
})

app.get('/', async (c) => {
    const [projects, admins] = await Promise.all([
        projectService.list(),
        db.execute(sql`SELECT * FROM accounts WHERE roles @> '{"admin"}'`).then(res => res.rows)
    ])

    return c.html(
        <Layout title="Dashboard" active="dashboard" projects={projects}>
            <h1 class="title">Dashboard</h1>

            <div class="columns">
                <div class="column">
                    <div class="notification is-link">
                        <p class="heading">Total Projects</p>
                        <p class="title">{projects.length}</p>
                    </div>
                </div>
                <div class="column">
                    <div class="notification is-primary">
                        <p class="heading">Active Admins</p>
                        <p class="title">{admins.length}</p>
                    </div>
                </div>
            </div>

            <div class="box">
                <h2 class="title is-4">Recent Projects</h2>
                <div class="table-container">
                    <table class="table is-fullwidth is-striped is-hoverable">
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
                                    <td><span class="tag is-success">Active</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    )
})

app.get('/projects', async (c) => {
    const projects = await projectService.list()
    const account = c.get('account')
    return c.html(
        <Layout title="Projects" active="projects" account={account} projects={projects}>
            <div class="level">
                <div class="level-left">
                    <div class="level-item">
                        <h1 class="title">Projects</h1>
                    </div>
                </div>
                <div class="level-right">
                    <div class="level-item">
                        <button class="button is-link" onclick="showModal('new-project-modal')">
                            <span>New Project</span>
                        </button>
                    </div>
                </div>
            </div>

            <div id="new-project-modal" class="modal">
                <div class="modal-background"></div>
                <div class="modal-card">
                    <header class="modal-card-head">
                        <p class="modal-card-title">Create New Project</p>
                        <button class="delete" onclick="hideModal('new-project-modal')"></button>
                    </header>
                    <section class="modal-card-body">
                        <form id="new-project-form">
                            <div class="field">
                                <label class="label">Project Name</label>
                                <div class="control">
                                    <input class="input" type="text" id="project-name" placeholder="My Awesome Project" required />
                                </div>
                            </div>
                            <div class="field">
                                <label class="label">Connection String</label>
                                <div class="control">
                                    <input class="input" type="text" id="project-conn" placeholder="postgres://..." required />
                                </div>
                            </div>
                            <div class="field">
                                <label class="label">Prefix</label>
                                <div class="control">
                                    <input class="input" type="text" id="project-prefix" value="santoki_" required />
                                </div>
                            </div>
                        </form>
                        <div id="project-error" class="notification is-danger" style="display: none;"></div>
                    </section>
                    <footer class="modal-card-foot">
                        <button class="button is-link" onclick="document.getElementById('new-project-form').requestSubmit()">Create</button>
                        <button class="button" onclick="hideModal('new-project-modal')">Cancel</button>
                    </footer>
                </div>
            </div>

            <script dangerouslySetInnerHTML={{
                __html: `
                document.getElementById('new-project-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('project-name').value;
                    const connectionString = document.getElementById('project-conn').value;
                    const prefix = document.getElementById('project-prefix').value;
                    const errorDiv = document.getElementById('project-error');
                    errorDiv.style.display = 'none';
                    try {
                        const res = await fetch('/v1/projects', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, connectionString, prefix })
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

            <div class="box">
                <div class="table-container">
                    <table class="table is-fullwidth is-striped is-hoverable">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Prefix</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projects.map(p => (
                                <tr>
                                    <td>{p.id}</td>
                                    <td>{p.name}</td>
                                    <td><code>{p.prefix}</code></td>
                                    <td>
                                        <a href={`/ui/projects/${p.id}`} class="button is-small">Manage</a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    )
})

app.get('/projects/:id', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const project = await projectService.getById(projectId)
    if (!project) return c.notFound()

    const collections = await collectionService.listByProject(projectId)
    const projects = await projectService.list()
    const account = c.get('account')

    return c.html(
        <Layout title={`Project: ${project.name}`} active="projects" account={account} projects={projects} currentProjectId={projectId}>
            <nav class="breadcrumb">
                <ul>
                    <li><a href="/ui/projects">Projects</a></li>
                    <li class="is-active"><a>{project.name}</a></li>
                </ul>
            </nav>

            <div class="level">
                <div class="level-left">
                    <div class="level-item">
                        <h1 class="title">{project.name}</h1>
                    </div>
                </div>
                <div class="level-right">
                    <div class="level-item">
                        <button class="button is-link" onclick="showModal('new-collection-modal')">New Collection</button>
                    </div>
                </div>
            </div>

            <div id="new-collection-modal" class="modal">
                <div class="modal-background"></div>
                <div class="modal-card">
                    <header class="modal-card-head">
                        <p class="modal-card-title">Create New Collection</p>
                        <button class="delete" onclick="hideModal('new-collection-modal')"></button>
                    </header>
                    <section class="modal-card-body">
                        <form id="new-collection-form">
                            <div class="field">
                                <label class="label">Collection Name</label>
                                <div class="control">
                                    <input class="input" type="text" id="collection-name" placeholder="posts" required />
                                </div>
                            </div>
                            <div class="field">
                                <label class="label">Primary Key Type</label>
                                <div class="control">
                                    <div class="select is-fullwidth">
                                        <select id="collection-id-type">
                                            <option value="serial">Incremental Integer (SERIAL)</option>
                                            <option value="uuid">UUID (v4)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </form>
                        <div id="collection-error" class="notification is-danger" style="display: none;"></div>
                    </section>
                    <footer class="modal-card-foot">
                        <button class="button is-link" onclick="document.getElementById('new-collection-form').requestSubmit()">Create</button>
                        <button class="button" onclick="hideModal('new-collection-modal')">Cancel</button>
                    </footer>
                </div>
            </div>

            <script dangerouslySetInnerHTML={{
                __html: `
                const projectId = ${projectId};
                document.getElementById('new-collection-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('collection-name').value;
                    const idType = document.getElementById('collection-id-type').value;
                    const errorDiv = document.getElementById('collection-error');
                    errorDiv.style.display = 'none';

                    try {
                        const res = await fetch('/v1/projects/collections', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-project-id': String(projectId)
                            },
                            body: JSON.stringify({ name, idType })
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

            <div class="columns">
                <div class="column is-8">
                    <div class="box">
                        <h2 class="title is-4">Collections</h2>
                        {collections.length === 0 ? (
                            <div class="notification">
                                No collections yet. Create your first one!
                            </div>
                        ) : (
                            <div class="table-container">
                                <table class="table is-fullwidth is-striped is-hoverable">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Physical Name</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {collections.map(col => (
                                            <tr>
                                                <td>{col.name}</td>
                                                <td><code>{col.physicalName}</code></td>
                                                <td>
                                                    <a href={`/ui/projects/${projectId}/collections/${col.name}`} class="button is-small is-primary">Design</a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
                <div class="column">
                    <div class="box">
                        <h2 class="title is-5">Details</h2>
                        <div class="field">
                            <label class="label">Project ID</label>
                            <div class="control">
                                <input class="input is-static" type="text" value={String(project.id)} readonly />
                            </div>
                        </div>
                        <div class="field">
                            <label class="label">Connection String</label>
                            <div class="control">
                                <input class="input is-static" type="text" value={project.connectionString} readonly />
                            </div>
                        </div>
                        <div class="field">
                            <label class="label">Created At</label>
                            <div class="control">
                                <input class="input is-static" type="text" value={project.createdAt ? new Date(project.createdAt).toLocaleString() : '-'} readonly />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    )
})

app.get('/projects/:id/collections/:colName', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const collectionName = c.req.param('colName')
    const account = c.get('account')

    try {
        const detail = await collectionService.getDetail(projectId, collectionName)
        const rows = (await dataService.findAll(projectId, collectionName)) as any[]
        const projects = await projectService.list()

        return c.html(
            <Layout title={`Collection: ${collectionName}`} active="projects" account={account} projects={projects} currentProjectId={projectId}>
                <nav class="breadcrumb">
                    <ul>
                        <li><a href="/ui/projects">Projects</a></li>
                        <li><a href={`/ui/projects/${projectId}`}>Project {projectId}</a></li>
                        <li class="is-active"><a>{collectionName}</a></li>
                    </ul>
                </nav>

                <div class="level">
                    <div class="level-left">
                        <div class="level-item">
                            <h1 class="title">{collectionName}</h1>
                        </div>
                    </div>
                    <div class="level-right">
                        <div class="level-item">
                            <div class="buttons">
                                <button class="button is-primary" onclick="showModal('add-row-modal')">Insert Data</button>
                                <button class="button is-link" onclick="showModal('add-field-modal')">Add Field</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="add-row-modal" class="modal">
                    <div class="modal-background"></div>
                    <div class="modal-card" style="width: 90%;">
                        <header class="modal-card-head">
                            <p class="modal-card-title">Insert New Record</p>
                            <button class="delete" onclick="hideModal('add-row-modal')"></button>
                        </header>
                        <section class="modal-card-body">
                            <form id="add-row-form">
                                <div class="columns is-multiline">
                                    {detail.fields.filter(f => f.column_name !== 'id' && f.column_name !== 'created_at' && f.column_name !== 'updated_at').map(field => (
                                        <div class="column is-half">
                                            <div class="field">
                                                <label class="label">
                                                    {(field as any).column_name}
                                                    <span class="tag is-small ml-2">{(field as any).data_type}</span>
                                                </label>
                                                <div class="control">
                                                    <input class="input" type="text" name={(field as any).column_name} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </form>
                            <div id="row-error" class="notification is-danger" style="display: none;"></div>
                        </section>
                        <footer class="modal-card-foot">
                            <button class="button is-link" onclick="document.getElementById('add-row-form').requestSubmit()">Insert</button>
                            <button class="button" onclick="hideModal('add-row-modal')">Cancel</button>
                        </footer>
                    </div>
                </div>

                <div id="add-field-modal" class="modal">
                    <div class="modal-background"></div>
                    <div class="modal-card">
                        <header class="modal-card-head">
                            <p class="modal-card-title">Add New Field</p>
                            <button class="delete" onclick="hideModal('add-field-modal')"></button>
                        </header>
                        <section class="modal-card-body">
                            <form id="add-field-form">
                                <div class="field">
                                    <label class="label">Field Name</label>
                                    <div class="control">
                                        <input class="input" type="text" id="field-name" placeholder="title" required />
                                    </div>
                                </div>
                                <div class="field">
                                    <label class="label">Type</label>
                                    <div class="control">
                                        <div class="select is-fullwidth">
                                            <select id="field-type">
                                                <option value="text">Text</option>
                                                <option value="integer">Integer</option>
                                                <option value="boolean">Boolean</option>
                                                <option value="timestamp">Timestamp</option>
                                                <option value="jsonb">JSONB</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div class="field">
                                    <div class="control">
                                        <label class="checkbox">
                                            <input type="checkbox" id="field-nullable" checked />
                                            Nullable
                                        </label>
                                    </div>
                                </div>
                            </form>
                            <div id="field-error" class="notification is-danger" style="display: none;"></div>
                        </section>
                        <footer class="modal-card-foot">
                            <button class="button is-link" onclick="document.getElementById('add-field-form').requestSubmit()">Add</button>
                            <button class="button" onclick="hideModal('add-field-modal')">Cancel</button>
                        </footer>
                    </div>
                </div>

                <script dangerouslySetInnerHTML={{
                    __html: `
                    const projectId = ${projectId};
                    const collectionName = '${collectionName}';
                    
                    document.getElementById('add-row-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        const data = {};
                        formData.forEach((value, key) => { data[key] = value; });
                        const errorDiv = document.getElementById('row-error');
                        errorDiv.style.display = 'none';

                        try {
                            const res = await fetch('/v1/data/' + collectionName, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-project-id': String(projectId)
                                },
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
                            const res = await fetch('/v1/projects/collections/' + collectionName + '/fields', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-project-id': String(projectId)
                                },
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
                            const res = await fetch('/v1/projects/collections/' + collectionName + '/fields/' + fieldName, {
                                method: 'DELETE',
                                headers: { 'x-project-id': String(projectId) }
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

                <div class="box mb-5">
                    <h2 class="title is-4">Data Rows</h2>
                    {rows.length === 0 ? (
                        <div class="notification">
                            No data yet.
                        </div>
                    ) : (
                        <div class="table-container">
                            <table class="table is-fullwidth is-striped is-hoverable">
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
                                                    {row[(f as any).column_name] === null ? <span class="has-text-grey-light">NULL</span> :
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

                <div class="columns">
                    <div class="column">
                        <div class="box">
                            <h2 class="title is-4">Fields</h2>
                            <div class="table-container">
                                <table class="table is-fullwidth is-striped">
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
                                                <td>{field.column_name}</td>
                                                <td><code>{field.data_type}</code></td>
                                                <td>
                                                    {field.is_nullable === 'YES'
                                                        ? <span class="tag is-success">Yes</span>
                                                        : <span class="tag is-danger">No</span>}
                                                </td>
                                                <td>
                                                    <button onclick={`deleteField('${field.column_name}')`} class="button is-small is-danger is-outlined">Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="column">
                        <div class="box">
                            <h2 class="title is-4">Indexes</h2>
                            {detail.indexes.length === 0 ? (
                                <p class="has-text-grey">No indexes found.</p>
                            ) : (
                                <div class="content">
                                    {detail.indexes.map(idx => (
                                        <div class="notification">
                                            <p class="has-text-weight-semibold">{idx.indexname}</p>
                                            <code class="is-size-7">{idx.indexdef}</code>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Layout>
        )
    } catch (e) {
        return c.html(<Layout title="Error" active="projects" account={c.get('account')}><div class="notification is-danger">Error: {String(e)}</div></Layout>)
    }
})

app.get('/admins', async (c) => {
    const admins = await db.execute(sql`SELECT * FROM accounts WHERE roles @> '{"admin"}'`).then(res => res.rows as any[])
    const projects = await projectService.list()
    const account = c.get('account')
    return c.html(
        <Layout title="Admins" active="admins" account={account} projects={projects}>
            <div class="level">
                <div class="level-left">
                    <div class="level-item">
                        <h1 class="title">Administrators</h1>
                    </div>
                </div>
                <div class="level-right">
                    <div class="level-item">
                        <button class="button is-link" onclick="showModal('invite-admin-modal')">Invite Admin</button>
                    </div>
                </div>
            </div>

            <div id="invite-admin-modal" class="modal">
                <div class="modal-background"></div>
                <div class="modal-card">
                    <header class="modal-card-head">
                        <p class="modal-card-title">Invite Admin</p>
                        <button class="delete" onclick="hideModal('invite-admin-modal')"></button>
                    </header>
                    <section class="modal-card-body">
                        <form id="invite-admin-form">
                            <div class="field">
                                <label class="label">Email Address</label>
                                <div class="control">
                                    <input class="input" type="email" id="admin-email" placeholder="admin@example.com" required />
                                </div>
                            </div>
                            <div class="field">
                                <label class="label">Password</label>
                                <div class="control">
                                    <input class="input" type="password" id="admin-password" placeholder="••••••••" required />
                                </div>
                            </div>
                        </form>
                        <div id="admin-error" class="notification is-danger" style="display: none;"></div>
                    </section>
                    <footer class="modal-card-foot">
                        <button class="button is-link" onclick="document.getElementById('invite-admin-form').requestSubmit()">Create</button>
                        <button class="button" onclick="hideModal('invite-admin-modal')">Cancel</button>
                    </footer>
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
                        const res = await fetch('/v1/auth/register', {
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

            <div class="box">
                <div class="table-container">
                    <table class="table is-fullwidth is-striped is-hoverable">
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
                                        <div class="media">
                                            <div class="media-left">
                                                <span class="tag is-link is-medium is-rounded">{admin.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div class="media-content">
                                                <p>{admin.name}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{admin.email}</td>
                                    <td>
                                        <div class="tags">
                                            {admin.roles?.map((role: any) => (
                                                <span class="tag">{role}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    )
})

export default app
