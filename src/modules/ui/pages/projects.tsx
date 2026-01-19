/** @jsxImportSource hono/jsx */
import { Layout } from '../components/layout.js'

export const Projects = (props: { projects: any[]; account: any }) => (
    <Layout title="Projects" active="projects" account={props.account} projects={props.projects}>
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
                
                const errorDiv = document.getElementById('project-error');
                errorDiv.style.display = 'none';
                try {
                    const res = await fetch('/v1/projects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
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
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.projects.map(p => (
                            <tr>
                                <td>{p.id}</td>
                                <td>{p.name}</td>
                                <td>
                                    <a href={`/ui/projects/${p.id}`} class="button is-small">Manage</a>
                                    {p.name !== 'system' && (
                                        <button class="button is-small is-danger ml-2" onclick={`showDeleteModal('${p.id}', '${p.name}')`}>Delete</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        <div id="delete-project-modal" class="modal">
            <div class="modal-background"></div>
            <div class="modal-card">
                <header class="modal-card-head">
                    <p class="modal-card-title">Delete Project</p>
                    <button class="delete" onclick="hideModal('delete-project-modal')"></button>
                </header>
                <section class="modal-card-body">
                    <p>Are you sure you want to delete project <strong id="delete-project-name"></strong>?</p>
                    <br />
                    <div class="field">
                        <div class="control">
                            <label class="checkbox">
                                <input type="checkbox" id="delete-project-data" />
                                <span class="ml-2">Also delete all data (tables) associated with this project</span>
                            </label>
                        </div>
                        <p class="help is-danger">Warning: checking this will permanently delete all data tables for this project.</p>
                    </div>
                    <input type="hidden" id="delete-project-id" />
                    <div id="delete-error" class="notification is-danger" style="display: none;"></div>
                </section>
                <footer class="modal-card-foot">
                    <button class="button is-danger" onclick="confirmDeleteProject()">Delete</button>
                    <button class="button" onclick="hideModal('delete-project-modal')">Cancel</button>
                </footer>
            </div>
        </div>

        <script dangerouslySetInnerHTML={{
            __html: `
            function showDeleteModal(id, name) {
                document.getElementById('delete-project-id').value = id;
                document.getElementById('delete-project-name').innerText = name;
                document.getElementById('delete-project-data').checked = false;
                document.getElementById('delete-error').style.display = 'none';
                showModal('delete-project-modal');
            }

            async function confirmDeleteProject() {
                const id = document.getElementById('delete-project-id').value;
                const deleteData = document.getElementById('delete-project-data').checked;
                const errorDiv = document.getElementById('delete-error');
                
                try {
                    const res = await fetch(\`/v1/projects/\${id}?deleteData=\${deleteData}\`, {
                        method: 'DELETE'
                    });
                    
                    if (res.ok) {
                        window.location.reload();
                    } else {
                        const data = await res.json();
                        errorDiv.textContent = data.error || 'Failed to delete project';
                        errorDiv.style.display = 'block';
                    }
                } catch (err) {
                    errorDiv.textContent = 'An error occurred';
                    errorDiv.style.display = 'block';
                }
            }
        `}} />
    </Layout>
)
