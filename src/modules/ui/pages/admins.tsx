/** @jsxImportSource hono/jsx */
import { Layout } from '../components/layout.js'

export const Admins = (props: { admins: any[]; projects: any[]; account: any }) => (
    <Layout title="Admins" active="admins" account={props.account} projects={props.projects}>
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
                        {props.admins.map(admin => (
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
