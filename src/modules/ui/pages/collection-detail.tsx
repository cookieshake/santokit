/** @jsxImportSource hono/jsx */
import { Layout } from '../components/layout.js'

export const CollectionDetail = (props: {
    projectId: number;
    currentDatabaseName: string;
    collectionName: string;
    detail: any;
    rows: any[];
    account: any;
    projects: any[];
    policies?: any[];
    collections: any[];
    databases: any[];
}) => {
    // We can't use useState in server-side rendered Hono JSX components usually without client interaction island logic
    // But since this is likely SSR + simple vanilla JS, we can use URL query param for tabs or client-side JS for tab switching.
    // Let's use simple Client-side JS tab switching for better UX.

    return (
        <Layout title={`Collection: ${props.collectionName}`} active="projects" account={props.account} projects={props.projects} currentProjectId={props.projectId} collections={props.collections} currentDatabaseName={props.currentDatabaseName} databases={props.databases}>
            <nav class="breadcrumb">
                <ul>
                    <li><a href="/ui/projects">Projects</a></li>
                    <li><a href={`/ui/projects/${props.projectId}`}>Project {props.projectId}</a></li>
                    <li class="is-active"><a>{props.collectionName}</a></li>
                </ul>
            </nav>

            <div class="level">
                <div class="level-left">
                    <div class="level-item">
                        <h1 class="title">{props.collectionName}</h1>
                    </div>
                </div>
            </div>

            <div class="tabs is-boxed">
                <ul>
                    <li class="is-active" data-tab="data-tab" onclick="switchTab('data-tab')"><a>Data</a></li>
                    <li data-tab="structure-tab" onclick="switchTab('structure-tab')"><a>Structure</a></li>
                    <li data-tab="policies-tab" onclick="switchTab('policies-tab')"><a>Policies</a></li>
                </ul>
            </div>

            <div id="data-tab" class="tab-content">
                <div class="level">
                    <div class="level-left"></div>
                    <div class="level-right">
                        <div class="level-item">
                            <div class="buttons">
                                <button class="button is-primary" onclick="showModal('add-row-modal')">Insert Data</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="box mb-5">
                    {props.rows.length === 0 ? (
                        <div class="notification">
                            No data yet.
                        </div>
                    ) : (
                        <div class="table-container">
                            <table class="table is-fullwidth is-striped is-hoverable">
                                <thead>
                                    <tr>
                                        {props.detail.fields.map((f: any) => (
                                            <th>{f.column_name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {props.rows.map(row => (
                                        <tr>
                                            {props.detail.fields.map((f: any) => (
                                                <td>
                                                    {row[f.column_name] === null ? <span class="has-text-grey-light">NULL</span> :
                                                        typeof row[f.column_name] === 'object' ? JSON.stringify(row[f.column_name]) :
                                                            String(row[f.column_name])}
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

            <div id="structure-tab" class="tab-content" style="display: none;">
                <div class="level">
                    <div class="level-left"></div>
                    <div class="level-right">
                        <div class="level-item">
                            <div class="buttons">
                                <button class="button is-link" onclick="showModal('add-field-modal')">Add Field</button>
                            </div>
                        </div>
                    </div>
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
                                        {props.detail.fields.map((field: any) => (
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
                            {props.detail.indexes.length === 0 ? (
                                <p class="has-text-grey">No indexes found.</p>
                            ) : (
                                <div class="content">
                                    {props.detail.indexes.map((idx: any) => (
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
            </div>

            <div id="policies-tab" class="tab-content" style="display: none;">
                <div class="columns">
                    <div class="column is-8">
                        <div class="box">
                            <h2 class="title is-5">Existing Policies</h2>
                            {(!props.policies || props.policies.length === 0) ? (
                                <div class="notification is-light">No policies defined for this collection.</div>
                            ) : (
                                <table class="table is-fullwidth is-hoverable">
                                    <thead>
                                        <tr>
                                            <th>Role</th>
                                            <th>Action</th>
                                            <th>Condition</th>
                                            <th>Effect</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {props.policies.map((policy: any) => (
                                            <tr>
                                                <td><span class="tag is-info is-light">{policy.role}</span></td>
                                                <td>{policy.action}</td>
                                                <td><code class="is-size-7">{policy.condition}</code></td>
                                                <td>
                                                    <span class={`tag ${policy.effect === 'allow' ? 'is-success' : 'is-danger'}`}>
                                                        {policy.effect}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        class="button is-small is-danger is-outlined"
                                                        onclick={`if(confirm('Delete policy?')) deletePolicy(${policy.id})`}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                    <div class="column is-4">
                        <div class="box">
                            <h2 class="title is-5">Create Policy</h2>
                            <form id="create-policy-form">
                                {/* Collection name is fixed to current collection */}
                                <input type="hidden" name="collectionName" value={props.collectionName} />

                                <div class="field">
                                    <label class="label">Role</label>
                                    <div class="control">
                                        <input class="input" type="text" name="role" placeholder="e.g. user, admin, guest" required />
                                    </div>
                                </div>
                                <div class="field">
                                    <label class="label">Action</label>
                                    <div class="control">
                                        <div class="select is-fullwidth">
                                            <select name="action" required>
                                                <option value="create">Create</option>
                                                <option value="read">Read</option>
                                                <option value="update">Update</option>
                                                <option value="delete">Delete</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div class="field">
                                    <label class="label">Condition (JSON)</label>
                                    <div class="control">
                                        <textarea class="textarea is-family-monospace" name="condition" placeholder='{"owner_id": "$user.id"}' rows={3} required>{'{}'}</textarea>
                                    </div>
                                    <p class="help">Use <code>$user.id</code> to reference the current user's ID.</p>
                                </div>
                                <div class="field">
                                    <label class="label">Effect</label>
                                    <div class="control">
                                        <label class="radio">
                                            <input type="radio" name="effect" value="allow" checked /> Allow
                                        </label>
                                        <label class="radio ml-3">
                                            <input type="radio" name="effect" value="deny" /> Deny
                                        </label>
                                    </div>
                                </div>
                                <div class="field">
                                    <div class="control">
                                        <button type="submit" class="button is-primary is-fullwidth">Create Policy</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals remain same, just moved buttons */}
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
                                {props.detail.fields.filter((f: any) => f.column_name !== 'id' && f.column_name !== 'created_at' && f.column_name !== 'updated_at').map((field: any) => (
                                    <div class="column is-half">
                                        <div class="field">
                                            <label class="label">
                                                {field.column_name}
                                                <span class="tag is-small ml-2">{field.data_type}</span>
                                            </label>
                                            <div class="control">
                                                <input class="input" type="text" name={field.column_name} />
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
                const projectId = ${props.projectId};
                const databaseName = '${props.currentDatabaseName}';
                const collectionName = '${props.collectionName}';
                
                function switchTab(tabId) {
                    // Update tabs
                    document.querySelectorAll('.tabs li').forEach(li => {
                        if (li.dataset.tab === tabId) li.classList.add('is-active');
                        else li.classList.remove('is-active');
                    });
                    // Update content
                    document.querySelectorAll('.tab-content').forEach(div => {
                        if (div.id === tabId) div.style.display = 'block';
                        else div.style.display = 'none';
                    });
                }
                window.switchTab = switchTab;

                document.getElementById('add-row-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const data = {};
                    formData.forEach((value, key) => { data[key] = value; });
                    const errorDiv = document.getElementById('row-error');
                    errorDiv.style.display = 'none';

                    try {
                        const res = await fetch(\`/v1/databases/\${databaseName}/collections/\${collectionName}/records\`, {
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
                        const res = await window.executeWithSqlConfirmation(\`/v1/databases/\${databaseName}/collections/\${collectionName}/fields\`, {
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
                    try {
                        const res = await window.executeWithSqlConfirmation(\`/v1/databases/\${databaseName}/collections/\${collectionName}/fields/\${fieldName}\`, {
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

                // Policy Functions
                document.getElementById('create-policy-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData.entries());
                    
                    try {
                        JSON.parse(data.condition);
                    } catch (err) {
                        alert('Invalid JSON in Condition field');
                        return;
                    }

                    const res = await fetch(\`/v1/databases/\${databaseName}/policies\`, {
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
                        const err = await res.json();
                        alert(err.error || 'Failed to create policy');
                    }
                });

                window.deletePolicy = async function(id) {
                     const res = await fetch(\`/v1/databases/\${databaseName}/policies/\${id}\`, {
                        method: 'DELETE',
                        headers: { 'x-project-id': String(projectId) }
                    });
                    if (res.ok) {
                        window.location.reload();
                    } else {
                        alert('Failed to delete policy');
                    }
                }
            `}} />
        </Layout>
    )
}
