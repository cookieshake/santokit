/** @jsxImportSource hono/jsx */
import { Layout } from '../components/layout.js'

export const ProjectDetail = (props: { project: any; collections: any[]; projects: any[]; account: any }) => (
    <Layout title={`Project: ${props.project.name}`} active="projects" account={props.account} projects={props.projects} currentProjectId={props.project.id} collections={props.collections}>
        <nav class="breadcrumb">
            <ul>
                <li><a href="/ui/projects">Projects</a></li>
                <li class="is-active"><a>{props.project.name}</a></li>
            </ul>
        </nav>

        <div class="level">
            <div class="level-left">
                <div class="level-item">
                    <h1 class="title">{props.project.name}</h1>
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
            const projectId = ${props.project.id};
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
                    {props.collections.length === 0 ? (
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
                                    {props.collections.map(col => (
                                        <tr>
                                            <td>{col.name}</td>
                                            <td><code>{col.physicalName}</code></td>
                                            <td>
                                                <a href={`/ui/projects/${props.project.id}/collections/${col.name}`} class="button is-small is-primary">Design</a>
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
                            <input class="input is-static" type="text" value={String(props.project.id)} readonly />
                        </div>
                    </div>
                    <div class="field">
                        <label class="label">Connection String</label>
                        <div class="control">
                            <input class="input is-static" type="text" value={props.project.connectionString} readonly />
                        </div>
                    </div>
                    <div class="field">
                        <label class="label">Created At</label>
                        <div class="control">
                            <input class="input is-static" type="text" value={props.project.createdAt ? new Date(props.project.createdAt).toLocaleString() : '-'} readonly />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Layout>
)
