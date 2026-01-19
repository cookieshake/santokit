/** @jsxImportSource hono/jsx */
import { Layout } from '../components/layout.js'

export const ProjectDetail = (props: {
  project: any
  collections: any[]
  projects: any[]
  account: any
  currentDatabaseName: string
  databases: any[]
  activeTab?: string
}) => (
  <Layout
    title={`Project: ${props.project.name}`}
    active="projects"
    account={props.account}
    projects={props.projects}
    currentProjectId={props.project.id}
    collections={props.collections}
    currentDatabaseName={props.currentDatabaseName}
    databases={props.databases}
    activeTab={props.activeTab}
  >
    <nav class="breadcrumb">
      <ul>
        <li>
          <a href="/ui/projects">Projects</a>
        </li>
        <li class="is-active">
          <a>{props.project.name}</a>
        </li>
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
          <div class="buttons">
            {(!props.activeTab || props.activeTab === 'overview') && (
              <button class="button is-primary" onclick="showModal('new-database-modal')">
                New Database
              </button>
            )}
            {props.activeTab === 'database' && (
              <button
                class="button is-link"
                onclick="showModal('new-collection-modal')"
                disabled={!props.currentDatabaseName}
              >
                New Collection
              </button>
            )}
          </div>
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
                <input
                  class="input"
                  type="text"
                  id="collection-name"
                  placeholder="posts"
                  required
                />
              </div>
            </div>
            <div class="field">
              <label class="label">Primary Key Type</label>
              <div class="control">
                <div class="select is-fullwidth">
                  <select id="collection-id-type">
                    <option value="serial">Incremental Integer (SERIAL)</option>
                    <option value="uuid">UUID (v4)</option>
                    <option value="typeid">TypeID</option>
                  </select>
                </div>
              </div>
            </div>
          </form>
          <div id="collection-error" class="notification is-danger" style="display: none;"></div>
        </section>
        <footer class="modal-card-foot">
          <button
            class="button is-link"
            onclick="document.getElementById('new-collection-form').requestSubmit()"
          >
            Create
          </button>
          <button class="button" onclick="hideModal('new-collection-modal')">
            Cancel
          </button>
        </footer>
      </div>
    </div>

    <div id="new-database-modal" class="modal">
      <div class="modal-background"></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">Add Database</p>
          <button class="delete" onclick="hideModal('new-database-modal')"></button>
        </header>
        <section class="modal-card-body">
          <form id="new-database-form">
            <div class="field">
              <label class="label">Database Name</label>
              <div class="control">
                <input class="input" type="text" id="db-name" placeholder="default" required />
              </div>
            </div>
            <div class="field">
              <label class="label">Connection String</label>
              <div class="control">
                <input
                  class="input"
                  type="text"
                  id="db-conn"
                  placeholder="postgres://..."
                  required
                />
              </div>
            </div>
          </form>
          <div id="db-error" class="notification is-danger" style="display: none;"></div>
        </section>
        <footer class="modal-card-foot">
          <button
            class="button is-link"
            onclick="document.getElementById('new-database-form').requestSubmit()"
          >
            Create
          </button>
          <button class="button" onclick="hideModal('new-database-modal')">
            Cancel
          </button>
        </footer>
      </div>
    </div>

    <script
      dangerouslySetInnerHTML={{
        __html: `
            const projectId = "${props.project.id}";
            const databaseName = "${props.currentDatabaseName}";
            document.getElementById('new-collection-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('collection-name').value;
                const idType = document.getElementById('collection-id-type').value;
                const errorDiv = document.getElementById('collection-error');
                errorDiv.style.display = 'none';

                try {
                    const res = await window.executeWithSqlConfirmation(\`/v1/databases/\${databaseName}/collections\`, {
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

            document.getElementById('new-database-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('db-name').value;
                const connectionString = document.getElementById('db-conn').value;
                const errorDiv = document.getElementById('db-error');
                errorDiv.style.display = 'none';

                try {
                    const res = await fetch(\`/v1/projects/\${projectId}/databases\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ name, connectionString })
                    });
                    if (res.ok) {
                        window.location.reload();
                    } else {
                        const data = await res.json();
                        errorDiv.textContent = data.error || data.details || 'Failed to create database';
                        errorDiv.style.display = 'block';
                    }
                } catch (err) {
                    errorDiv.textContent = 'An error occurred';
                    errorDiv.style.display = 'block';
                }
            });

            window.deleteDatabase = async (dbId) => {
                if (!confirm('Are you sure you want to delete this database? This will delete all collections and data within it.')) return;
                
                try {
                    const res = await fetch(\`/v1/projects/\${projectId}/databases/\${dbId}\`, {
                        method: 'DELETE'
                    });
                     if (res.ok) {
                        window.location.reload();
                    } else {
                        const data = await res.json();
                        alert(data.error || 'Failed to delete database');
                    }
                } catch (e) {
                    alert('Error deleting database');
                }
            };
        `,
      }}
    />

    <div class="columns">
      <div class="column is-8">
        {(!props.activeTab || props.activeTab === 'overview') && (
          <div class="box">
            <h2 class="title is-4">Databases</h2>
            <div class="table-container">
              <table class="table is-fullwidth is-striped is-hoverable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Connection</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {props.databases.map((db) => (
                    <tr>
                      <td>{db.name}</td>
                      <td title={db.connection_string}>
                        {(db.connection_string || '').length > 50
                          ? (db.connection_string || '').substring(0, 50) + '...'
                          : db.connection_string}
                      </td>
                      <td>
                        <button
                          class="button is-small is-danger"
                          onclick={`deleteDatabase(${db.id})`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {props.activeTab === 'database' && (
          <div class="box">
            <h2 class="title is-4">Collections</h2>
            {props.collections.length === 0 ? (
              <div class="notification">No collections yet. Create your first one!</div>
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
                    {props.collections.map((col) => (
                      <tr>
                        <td>{col.name}</td>
                        <td>
                          <code>{col.physical_name}</code>
                        </td>
                        <td>
                          <a
                            href={`/ui/projects/${props.project.id}/collections/${col.name}`}
                            class="button is-small is-primary"
                          >
                            Design
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <div class="column">
        <div class="box">
          <h2 class="title is-5">Details</h2>
          <div class="field">
            <label class="label">Project ID</label>
            <div class="control">
              <input
                class="input is-static"
                type="text"
                value={String(props.project.id)}
                readonly
              />
            </div>
          </div>

          <div class="field">
            <label class="label">Created At</label>
            <div class="control">
              <input
                class="input is-static"
                type="text"
                value={
                  props.project.created_at
                    ? new Date(props.project.created_at).toLocaleString()
                    : '-'
                }
                readonly
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Layout>
)
