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
                        {props.projects.map(p => (
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
