/** @jsxImportSource hono/jsx */
import { Hono } from 'hono'
import { projectService } from '@/modules/project/project.service.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { dataService } from '@/modules/data/data.service.js'
import { db } from '@/db/index.js'
// accounts import removed
import { arrayContains, sql } from 'drizzle-orm'

const app = new Hono<{
    Variables: {
        account: any;
    };
}>()

const Layout = (props: { title: string; children: any; active: string; account?: any; projects?: any[]; currentProjectId?: number }) => (
    <html lang="en" data-theme="corporate">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{props.title} | Santoki Admin</title>
            <link rel="stylesheet" href="/assets/admin-ui.css" />
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/inter-ui@3.19.3/inter.css" />
        </head>
        <body class="min-h-screen bg-base-200 font-sans">
            <div class="drawer lg:drawer-open">
                <input id="my-drawer-2" type="checkbox" class="drawer-toggle" />
                <div class="drawer-content flex flex-col">
                    {/* Top Navbar */}
                    <div class="w-full navbar bg-base-100 shadow-sm border-b border-base-300">
                        <div class="flex-none lg:hidden">
                            <label for="my-drawer-2" aria-label="open sidebar" class="btn btn-square btn-ghost">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-6 h-6 stroke-current"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                            </label>
                        </div>
                        <div class="flex-1 px-2 lg:px-4">
                            {props.projects && props.projects.length > 0 ? (
                                <div class="dropdown">
                                    <label tabindex={0} class="btn btn-ghost gap-2 normal-case">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M12 2L2 7L12 12L22 7L12 2Z"></path>
                                            <path d="M2 17L12 22L22 17"></path>
                                            <path d="M2 12L12 17L22 12"></path>
                                        </svg>
                                        <span class="font-semibold">
                                            {props.currentProjectId
                                                ? props.projects.find(p => p.id === props.currentProjectId)?.name || 'Select Project'
                                                : 'Select Project'}
                                        </span>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </label>
                                    <ul tabindex={0} class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-64 mt-2 border border-base-300">
                                        {props.projects.map(project => (
                                            <li>
                                                <a
                                                    href={`/ui/projects/${project.id}`}
                                                    class={props.currentProjectId === project.id ? 'active' : ''}
                                                >
                                                    <div class="flex flex-col items-start gap-1">
                                                        <span class="font-semibold">{project.name}</span>
                                                        <span class="text-xs opacity-60">ID: {project.id}</span>
                                                    </div>
                                                </a>
                                            </li>
                                        ))}
                                        <div class="divider my-1"></div>
                                        <li>
                                            <a href="/ui/projects" class="text-primary">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                                </svg>
                                                Manage All Projects
                                            </a>
                                        </li>
                                    </ul>
                                </div>
                            ) : (
                                <span class="text-xl font-bold lg:hidden">Santoki Admin</span>
                            )}
                        </div>
                    </div>

                    <main class="p-6 md:p-10">
                        {props.children}
                    </main>
                </div>
                <div class="drawer-side">
                    <label for="my-drawer-2" aria-label="close sidebar" class="drawer-overlay"></label>
                    <aside class="menu p-4 w-72 min-h-full bg-base-100 text-base-content border-r border-base-300">
                        <div class="flex items-center gap-3 px-4 py-4 mb-4 text-2xl font-bold text-primary">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-primary">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                            Santoki
                        </div>
                        <ul class="menu w-full text-base-content text-base font-medium">
                            <li><a href="/ui" class={props.active === 'dashboard' ? 'active' : ''}>Dashboard</a></li>
                            <li><a href="/ui/projects" class={props.active === 'projects' ? 'active' : ''}>Projects</a></li>
                            <li><a href="/ui/admins" class={props.active === 'admins' ? 'active' : ''}>Admins</a></li>
                        </ul>
                        {props.account && (
                            <div class="mt-auto p-4 border-t border-base-200">
                                <div class="flex items-center gap-3">
                                    <div class="avatar placeholder">
                                        <div class="bg-neutral-focus text-neutral-content rounded-full w-10">
                                            <span class="text-xs">{props.account.email?.charAt(0).toUpperCase()}</span>
                                        </div>
                                    </div>
                                    <div class="text-sm overflow-hidden text-ellipsis">
                                        <div class="font-bold">{props.account.name || 'Admin'}</div>
                                        <div class="opacity-70 text-xs">{props.account.email}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </div>

            {/* Modal Container if needed */}
            <div id="modal-container"></div>

            <script dangerouslySetInnerHTML={{
                __html: `
                function showModal(id) {
                    const el = document.getElementById(id);
                    if(el) el.showModal();
                }
                function hideModal(id) {
                    const el = document.getElementById(id);
                    if(el) el.close();
                }
                // Close when clicking outside
                window.addEventListener('click', (e) => {
                    if (e.target.tagName === 'DIALOG') {
                        e.target.close();
                    }
                });
            `}} />
        </body>
    </html>
)

app.get('/login', (c) => {
    return c.html(
        <html lang="en" data-theme="light">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Login | Santoki Admin</title>
                <link rel="stylesheet" href="/assets/admin-ui.css" />
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/inter-ui@3.19.3/inter.css" />
            </head>
            <body class="flex items-center justify-center min-h-screen bg-base-200">
                <div class="card w-96 bg-base-100 shadow-xl">
                    <div class="card-body">
                        <div class="flex flex-col items-center gap-2 mb-4">
                            <div class="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-2">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                            </div>
                            <h2 class="card-title text-2xl">Santoki Admin</h2>
                            <p class="text-base-content/60 text-sm">Sign in to your account</p>
                        </div>
                        <form id="login-form" class="space-y-4">
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">Email</span>
                                </label>
                                <input type="email" id="email" class="input input-bordered w-full" placeholder="admin@example.com" required />
                            </div>
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">Password</span>
                                </label>
                                <input type="password" id="password" class="input input-bordered w-full" placeholder="••••••••" required />
                            </div>
                            <div class="form-control mt-6">
                                <button type="submit" class="btn btn-primary w-full">Sign In</button>
                            </div>
                        </form>
                        <div id="error-message" class="alert alert-error mt-4 hidden">
                            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span id="error-text"></span>
                        </div>
                    </div>

                    <script dangerouslySetInnerHTML={{
                        __html: `
            const form = document.getElementById('login-form');
            const errorDiv = document.getElementById('error-message');
            const errorText = document.getElementById('error-text');
            
            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              errorDiv.classList.add('hidden');
              errorDiv.classList.remove('flex');
              
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
                  errorDiv.classList.remove('hidden');
                  errorDiv.classList.add('flex');
                }
              } catch (err) {
                errorText.textContent = 'An error occurred';
                errorDiv.classList.remove('hidden');
                errorDiv.classList.add('flex');
              }
            });
          `}} />
                </div>
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
            <div class="mb-8">
                <h1 class="text-3xl font-bold">Dashboard</h1>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div class="stats shadow bg-base-100">
                    <div class="stat">
                        <div class="stat-title">Total Projects</div>
                        <div class="stat-value text-primary">{projects.length}</div>
                    </div>
                </div>
                <div class="stats shadow bg-base-100">
                    <div class="stat">
                        <div class="stat-title">Active Admins</div>
                        <div class="stat-value text-accent">{admins.length}</div>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="card-title">Recent Projects</h2>
                        {projects.length > 5 && (
                            <a href="/ui/projects" class="btn btn-outline btn-sm">View All</a>
                        )}
                    </div>
                    <div class="overflow-x-auto">
                        <table class="table table-zebra">
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
                                        <td class="font-bold">{p.name}</td>
                                        <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}</td>
                                        <td><div class="badge badge-success gap-2 text-white">Active</div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold">Projects</h1>
                <button class="btn btn-primary" onclick="showModal('new-project-modal')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    New Project
                </button>
            </div>

            <dialog id="new-project-modal" class="modal">
                <div class="modal-box">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="hideModal('new-project-modal')">✕</button>
                    <h3 class="font-bold text-lg mb-4">Create New Project</h3>
                    <form id="new-project-form" class="space-y-4">
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Project Name</span>
                            </label>
                            <input type="text" id="project-name" class="input input-bordered w-full" placeholder="My Awesome Project" required />
                        </div>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Connection String</span>
                            </label>
                            <input type="text" id="project-conn" class="input input-bordered w-full" placeholder="postgres://..." required />
                        </div>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Prefix</span>
                            </label>
                            <input type="text" id="project-prefix" class="input input-bordered w-full" value="santoki_" required />
                        </div>
                        <div class="modal-action">
                            <button type="submit" class="btn btn-primary w-full">Create Project</button>
                        </div>
                    </form>
                    <div id="project-error" class="alert alert-error mt-4 hidden"></div>
                </div>
            </dialog>

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
                        const body = {
                            name,
                            connectionString,
                            prefix
                        };

                        const res = await fetch('/v1/projects', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        if (res.ok) {
                            window.location.reload();
                        } else {
                            const data = await res.json();
                            errorDiv.textContent = data.error || 'Failed to create project';
                            errorDiv.classList.remove('hidden');
                             errorDiv.style.display = 'grid';
                        }
                    } catch (err) {
                        errorDiv.textContent = 'An error occurred';
                        errorDiv.classList.remove('hidden');
                         errorDiv.style.display = 'grid';
                    }
                });
            `}} />
            <div class="card bg-base-100 shadow-xl overflow-x-auto">
                <table class="table table-zebra">
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
                                <td class="font-bold">{p.name}</td>
                                <td><code class="badge badge-ghost">{p.prefix}</code></td>
                                <td>
                                    <a href={`/ui/projects/${p.id}`} class="btn btn-sm btn-outline">Manage</a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Layout>
    )
})

// Sources route removed

app.get('/projects/:id', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const project = await projectService.getById(projectId)
    if (!project) return c.notFound()

    const collections = await collectionService.listByProject(projectId)
    const projects = await projectService.list()
    const account = c.get('account')

    return c.html(
        <Layout title={`Project: ${project.name}`} active="projects" account={account} projects={projects} currentProjectId={projectId}>
            <div class="flex justify-between items-center mb-6">
                <div class="flex items-center gap-4">
                    <a href="/ui/projects" class="btn btn-square btn-ghost">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    </a>
                    <h1 class="text-3xl font-bold">{project.name}</h1>
                </div>
                <button class="btn btn-primary" onclick="showModal('new-collection-modal')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    NewCollection
                </button>
            </div>

            <dialog id="new-collection-modal" class="modal">
                <div class="modal-box">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="hideModal('new-collection-modal')">✕</button>
                    <h3 class="font-bold text-lg mb-4">Create New Collection</h3>
                    <form id="new-collection-form" class="space-y-4">
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Collection Name</span>
                            </label>
                            <input type="text" id="collection-name" class="input input-bordered w-full" placeholder="posts" required />
                        </div>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Primary Key Type</span>
                            </label>
                            <select id="collection-id-type" class="select select-bordered w-full">
                                <option value="serial">Incremental Integer (SERIAL)</option>
                                <option value="uuid">UUID (v4)</option>
                            </select>
                        </div>
                        <div class="modal-action">
                            <button type="submit" class="btn btn-primary w-full">Create Collection</button>
                        </div>
                    </form>
                    <div id="collection-error" class="alert alert-error mt-4 hidden"></div>
                </div>
            </dialog>

            <script dangerouslySetInnerHTML={{
                __html: `
                document.getElementById('new-collection-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const name = document.getElementById('collection-name').value;
                    const errorDiv = document.getElementById('collection-error');
                    errorDiv.classList.add('hidden');
                    errorDiv.classList.remove('flex');

                    try {
                        const res = await fetch('/v1/projects/collections', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-project-id': String(projectId)
                            },
                            body: JSON.stringify({
                                name,
                                idType: document.getElementById('collection-id-type').value
                            })
                        });
                        if (res.ok) {
                            window.location.reload();
                        } else {
                            const data = await res.json();
                            errorDiv.textContent = data.error || data.details || 'Failed to create collection';
                            errorDiv.classList.remove('hidden');
                            errorDiv.style.display = 'grid';
                        }
                    } catch (err) {
                        errorDiv.textContent = 'An error occurred';
                        errorDiv.classList.remove('hidden');
                        errorDiv.style.display = 'grid';
                    }
                });
            `}} />

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="card bg-base-100 shadow-xl lg:col-span-2">
                    <div class="card-body">
                        <h2 class="card-title mb-4">Collections</h2>
                        {collections.length === 0 ? (
                            <div class="text-center py-10 opacity-50">
                                <p>No collections yet. Create your first one!</p>
                            </div>
                        ) : (
                            <div class="overflow-x-auto">
                                <table class="table table-zebra">
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
                                                <td class="font-bold">{col.name}</td>
                                                <td><code class="badge badge-ghost">{col.physicalName}</code></td>
                                                <td>
                                                    <a href={`/ui/projects/${projectId}/collections/${col.name}`} class="btn btn-sm btn-secondary">Design</a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
                <div class="card bg-base-100 shadow-xl h-fit">
                    <div class="card-body">
                        <h2 class="card-title mb-4">Details</h2>
                        <div class="form-control w-full">
                            <label class="label">
                                <span class="label-text">Project ID</span>
                            </label>
                            <input type="text" value={String(project.id)} readonly class="input input-bordered w-full bg-base-200" />
                        </div>
                        <div class="form-control w-full">
                            <label class="label">
                                <span class="label-text">Connection String</span>
                            </label>
                            <input type="text" value={project.connectionString} readonly class="input input-bordered w-full bg-base-200" />
                        </div>
                        <div class="form-control w-full">
                            <label class="label">
                                <span class="label-text">Created At</span>
                            </label>
                            <input type="text" value={project.createdAt ? new Date(project.createdAt).toLocaleString() : '-'} readonly class="input input-bordered w-full bg-base-200" />
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
                <div class="flex justify-between items-center mb-6">
                    <div class="flex items-center gap-4">
                        <a href={`/ui/projects/${projectId}`} class="btn btn-square btn-ghost">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </a>
                        <h1 class="text-3xl font-bold">{collectionName}</h1>
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" onclick="showModal('add-row-modal')">Insert Data</button>
                        <button class="btn btn-primary" onclick="showModal('add-field-modal')">Add Field</button>
                    </div>
                </div>

                <dialog id="add-row-modal" class="modal">
                    <div class="modal-box w-11/12 max-w-5xl">
                        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="hideModal('add-row-modal')">✕</button>
                        <h3 class="font-bold text-lg mb-4">Insert New Record</h3>
                        <form id="add-row-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {detail.fields.filter(f => f.column_name !== 'id' && f.column_name !== 'created_at' && f.column_name !== 'updated_at').map(field => (
                                <div class="form-control">
                                    <label class="label">
                                        <span class="label-text">{(field as any).column_name}</span>
                                        <span class="label-text-alt opacity-50">{(field as any).data_type}</span>
                                    </label>
                                    <input type="text" name={(field as any).column_name} class="input input-bordered w-full" placeholder={`Enter ${(field as any).column_name}`} />
                                </div>
                            ))}
                            <div class="col-span-1 md:col-span-2 modal-action">
                                <button type="submit" class="btn btn-primary w-full">Insert Record</button>
                            </div>
                        </form>
                        <div id="row-error" class="alert alert-error mt-4 hidden"></div>
                    </div>
                </dialog>

                <dialog id="add-field-modal" class="modal">
                    <div class="modal-box">
                        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="hideModal('add-field-modal')">✕</button>
                        <h3 class="font-bold text-lg mb-4">Add New Field</h3>
                        <form id="add-field-form" class="space-y-4">
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">Field Name</span>
                                </label>
                                <input type="text" id="field-name" class="input input-bordered w-full" placeholder="title" required />
                            </div>
                            <div class="form-control">
                                <label class="label">
                                    <span class="label-text">Type</span>
                                </label>
                                <select id="field-type" class="select select-bordered w-full">
                                    <option value="text">Text</option>
                                    <option value="integer">Integer</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="timestamp">Timestamp</option>
                                    <option value="jsonb">JSONB</option>
                                </select>
                            </div>
                            <div class="form-control">
                                <label class="label cursor-pointer justify-start gap-4">
                                    <input type="checkbox" id="field-nullable" checked class="checkbox checkbox-primary" />
                                    <span class="label-text">Nullable</span>
                                </label>
                            </div>
                            <div class="modal-action">
                                <button type="submit" class="btn btn-primary w-full">Add Field</button>
                            </div>
                        </form>
                        <div id="field-error" class="alert alert-error mt-4 hidden"></div>
                    </div>
                </dialog>

                <script dangerouslySetInnerHTML={{
                    __html: `
                    document.getElementById('add-row-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);
                        const data = {};
                        formData.forEach((value, key) => { data[key] = value; });
                        const errorDiv = document.getElementById('row-error');
                        errorDiv.classList.add('hidden');
                        errorDiv.classList.remove('flex'); // likely grid or flex

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
                                errorDiv.classList.remove('hidden');
                                errorDiv.style.display = 'grid';
                            }
                        } catch (err) {
                            errorDiv.textContent = 'An error occurred';
                            errorDiv.classList.remove('hidden');
                            errorDiv.style.display = 'grid';
                        }
                    });

                    document.getElementById('add-field-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const name = document.getElementById('field-name').value;
                        const type = document.getElementById('field-type').value;
                        const isNullable = document.getElementById('field-nullable').checked;
                        const errorDiv = document.getElementById('field-error');
                        errorDiv.classList.add('hidden');
                        errorDiv.classList.remove('flex');

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
                errorDiv.classList.remove('hidden');
                errorDiv.style.display = 'grid';
                            }
                        } catch (err) {
                    errorDiv.textContent = 'An error occurred';
                errorDiv.classList.remove('hidden');
                errorDiv.style.display = 'grid';
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

                <div class="card bg-base-100 shadow-xl mb-8">
                    <div class="card-body">
                        <h2 class="card-title mb-4">Data Rows</h2>
                        {rows.length === 0 ? (
                            <div class="text-center py-10 opacity-50">
                                <p>No data yet.</p>
                            </div>
                        ) : (
                            <div class="overflow-x-auto">
                                <table class="table table-zebra table-sm">
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
                                                    <td class="max-w-xs truncate">
                                                        {row[(f as any).column_name] === null ? <span class="opacity-50">NULL</span> :
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

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="card bg-base-100 shadow-xl">
                        <div class="card-body">
                            <h2 class="card-title mb-4">Fields</h2>
                            <div class="overflow-x-auto">
                                <table class="table table-zebra">
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
                                                <td class="font-bold">{field.column_name}</td>
                                                <td><code class="badge badge-ghost">{field.data_type}</code></td>
                                                <td>{field.is_nullable === 'YES' ? <span class="text-success">Yes</span> : <span class="text-error">No</span>}</td>
                                                <td>
                                                    <button onclick={`deleteField('${field.column_name}')`} class="btn btn-xs btn-error btn-outline">Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="card bg-base-100 shadow-xl h-fit">
                        <div class="card-body">
                            <h2 class="card-title mb-4">Indexes</h2>
                            {detail.indexes.length === 0 ? (
                                <p class="opacity-50">No indexes found.</p>
                            ) : (
                                <ul class="menu bg-base-200 w-full rounded-box">
                                    {detail.indexes.map(idx => (
                                        <li>
                                            <div class="flex flex-col items-start gap-1">
                                                <span class="font-bold">{idx.indexname}</span>
                                                <code class="text-xs break-all">{idx.indexdef}</code>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </Layout>
        )
    } catch (e) {
        return c.html(<Layout title="Error" active="projects" account={c.get('account')}><div>Error: {String(e)}</div></Layout>)
    }
})

app.get('/admins', async (c) => {
    const admins = await db.execute(sql`SELECT * FROM accounts WHERE roles @> '{"admin"}'`).then(res => res.rows as any[])
    const projects = await projectService.list()
    const account = c.get('account')
    return c.html(
        <Layout title="Admins" active="admins" account={account} projects={projects}>
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold">Administrators</h1>
                <button class="btn btn-primary" onclick="showModal('invite-admin-modal')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Invite Admin
                </button>
            </div>

            <dialog id="invite-admin-modal" class="modal">
                <div class="modal-box">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="hideModal('invite-admin-modal')">✕</button>
                    <h3 class="font-bold text-lg mb-4">Invite Admin</h3>
                    <form id="invite-admin-form" class="space-y-4">
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Email Address</span>
                            </label>
                            <input type="email" id="admin-email" class="input input-bordered w-full" placeholder="admin@example.com" required />
                        </div>
                        <div class="form-control">
                            <label class="label">
                                <span class="label-text">Password</span>
                            </label>
                            <input type="password" id="admin-password" class="input input-bordered w-full" placeholder="••••••••" required />
                        </div>
                        <div class="modal-action">
                            <button type="submit" class="btn btn-primary w-full">Create Admin</button>
                        </div>
                    </form>
                    <div id="admin-error" class="alert alert-error mt-4 hidden"></div>
                </div>
            </dialog>

            <script dangerouslySetInnerHTML={{
                __html: `
                document.getElementById('invite-admin-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('admin-email').value;
                    const password = document.getElementById('admin-password').value;
                    const errorDiv = document.getElementById('admin-error');
                    errorDiv.classList.add('hidden');
                    errorDiv.classList.remove('flex');

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
                            errorDiv.classList.remove('hidden');
                             errorDiv.style.display = 'grid';
                        }
                    } catch (err) {
                        errorDiv.textContent = 'An error occurred';
                        errorDiv.classList.remove('hidden');
                         errorDiv.style.display = 'grid';
                    }
                });
            `}} />
            <div class="card bg-base-100 shadow-xl overflow-x-auto">
                <table class="table table-zebra">
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
                                    <div class="flex items-center gap-3">
                                        <div class="avatar placeholder">
                                            <div class="bg-primary text-primary-content rounded-full w-8">
                                                <span class="text-xs">{admin.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                        </div>
                                        <div class="font-bold">{admin.name}</div>
                                    </div>
                                </td>
                                <td>{admin.email}</td>
                                <td>
                                    <div class="flex gap-2">
                                        {admin.roles?.map((role: any) => (
                                            <span class="badge badge-outline">{role}</span>
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
