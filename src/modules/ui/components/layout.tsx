/** @jsxImportSource hono/jsx */

export const Layout = (props: { title: string; children: any; active: string; account?: any; projects?: any[]; currentProjectId?: number; collections?: any[]; currentDatabaseName?: string; databases?: any[] }) => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{props.title} | Santoki Admin</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css" />
            <script dangerouslySetInnerHTML={{
                __html: `
                // Initialize theme immediately to prevent flash
                const savedTheme = localStorage.getItem('theme');
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                  document.documentElement.setAttribute('data-theme', 'light');
                }

                let sqlConfirmResolve = null;
                window.executeWithSqlConfirmation = async (url, options) => {
                    try {
                        // 1. Preview
                        const sep = url.includes('?') ? '&' : '?';
                        const previewUrl = url + sep + 'preview=true';
                        // Clone options body because it might be consumed? fetch body is not consumed but good practice.
                        // Actually fetch body if string is fine.
                        const previewRes = await fetch(previewUrl, options);
                        
                        if (!previewRes.ok) {
                            const err = await previewRes.json();
                            alert(err.message || err.error || 'Error getting preview');
                            throw new Error('Preview failed');
                        }
                        
                        const previewData = await previewRes.json();
                        
                        // 2. Show Modal
                        const sqlContent = document.getElementById('sql-preview-content');
                        if (sqlContent) sqlContent.textContent = previewData.sql || '-- No SQL generated or preview not supported --';
                        showModal('sql-preview-modal');

                        // 3. Wait for confirmation
                        return new Promise((resolve, reject) => {
                            sqlConfirmResolve = async () => {
                                try {
                                    hideModal('sql-preview-modal');
                                    // 4. Execute Real
                                    const res = await fetch(url, options);
                                    resolve(res);
                                } catch (e) {
                                    reject(e);
                                }
                            };
                            // Also handle cancel?
                            // For now simple.
                        });
                    } catch (e) {
                        console.error(e);
                        throw e;
                    }
                };

                document.addEventListener('DOMContentLoaded', () => {
                    const confirmBtn = document.getElementById('sql-confirm-btn');
                    if (confirmBtn) {
                        confirmBtn.addEventListener('click', () => {
                            if (sqlConfirmResolve) sqlConfirmResolve();
                        });
                    }

                    function showModal(id) {
                        document.getElementById(id)?.classList.add('is-active');
                    }
                    window.showModal = showModal; // Expose globally

                    function hideModal(id) {
                        document.getElementById(id)?.classList.remove('is-active');
                    }
                    window.hideModal = hideModal; // Expose globally

                    function toggleDropdown(id) {
                        document.getElementById(id)?.classList.toggle('is-active');
                    }
                    window.toggleDropdown = toggleDropdown; 

                    // Close dropdowns when clicking outside
                    document.addEventListener('click', (e) => {
                        if (!e.target.closest('.dropdown')) {
                            document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('is-active'));
                        }
                    });
                    // Close modals
                    document.querySelectorAll('.modal-background, .modal-close, .delete, .modal-cancel').forEach(el => {
                        el.addEventListener('click', () => {
                            el.closest('.modal')?.classList.remove('is-active');
                        });
                    });
                });
                
                function toggleTheme() {
                    const current = document.documentElement.getAttribute('data-theme');
                    const next = current === 'dark' ? 'light' : 'dark';
                    document.documentElement.setAttribute('data-theme', next);
                    localStorage.setItem('theme', next);
                    updateThemeIcon();
                }
                window.toggleTheme = toggleTheme;

                function updateThemeIcon() {
                    const current = document.documentElement.getAttribute('data-theme');
                    const icon = document.getElementById('theme-toggle-icon');
                    if (icon) {
                        icon.innerText = current === 'dark' ? '☀️' : '🌙';
                    }
                }

                window.addEventListener('DOMContentLoaded', updateThemeIcon);
            `}} />
        </head>
        <body>
            <div id="sql-preview-modal" class="modal" style="z-index: 9999;">
                <div class="modal-background"></div>
                <div class="modal-card" style="width: 800px; max-width: 90vw;">
                    <header class="modal-card-head has-background-warning-light">
                        <p class="modal-card-title">⚠️ Confirm SQL Execution</p>
                        <button class="delete" aria-label="close"></button>
                    </header>
                    <section class="modal-card-body">
                        <div class="notification is-warning is-light">
                            The following SQL statements will be executed against the database. Please review them carefully.
                        </div>
                        <div class="control">
                            <textarea id="sql-preview-content" class="textarea is-family-monospace" readonly rows={10} style="white-space: pre;"></textarea>
                        </div>
                    </section>
                    <footer class="modal-card-foot">
                        <button id="sql-confirm-btn" class="button is-danger">Execute SQL</button>
                        <button class="button modal-cancel">Cancel</button>
                    </footer>
                </div>
            </div>

            <nav class="navbar has-shadow" role="navigation" aria-label="main navigation">
                <div class="navbar-brand">
                    <a class="navbar-item" href="/ui/projects">
                        <span class="is-size-4 has-text-link has-text-weight-bold">Santoki</span>
                    </a>
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
                <div class="navbar-end">
                    <div class="navbar-item">
                        <button class="button is-ghost" onclick="toggleTheme()" title="Toggle Dark Mode">
                            <span class="icon is-medium" id="theme-toggle-icon">
                                🌙
                            </span>
                        </button>
                    </div>
                    {props.account && (
                        <div class="navbar-item has-dropdown is-hoverable">
                            <a class="navbar-link is-arrowless">
                                <div class="media is-align-items-center">
                                    <div class="media-left mr-2">
                                        <figure class="image is-32x32">
                                            <span class="tag is-link is-rounded has-text-weight-bold">
                                                {props.account.email?.charAt(0).toUpperCase()}
                                            </span>
                                        </figure>
                                    </div>
                                    <div class="is-hidden-touch">
                                        <span class="is-size-7 has-text-weight-semibold">{props.account.name || 'Admin'}</span>
                                    </div>
                                </div>
                            </a>
                            <div class="navbar-dropdown is-right">
                                <div class="navbar-item">
                                    <div class="is-size-7">
                                        <p class="has-text-weight-bold">{props.account.name || 'Admin'}</p>
                                        <p class="has-text-grey">{props.account.email}</p>
                                    </div>
                                </div>
                                <hr class="navbar-divider" />
                                <a href="/ui/logout" class="navbar-item has-text-danger">
                                    Logout
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </nav>

            <div class="columns is-gapless mb-0" style="min-height: calc(100vh - 3.25rem);">
                {/* Level 1 Sidebar (Database Switcher) */}
                {props.currentProjectId && props.databases && props.databases.length > 0 && (
                    <div class="is-hidden-mobile" style="width: 70px; background-color: #1a1b1e; border-right: 1px solid #2c2d30; display: flex; flex-direction: column; align-items: center; padding-top: 20px; flex-shrink: 0;">
                        {props.databases.map((db: any) => (
                            <a
                                href={`/ui/projects/${props.currentProjectId}?db=${db.name}`}
                                title={db.name}
                                style={`
                                    width: 42px; height: 42px; 
                                    border-radius: 12px; 
                                    background-color: ${props.currentDatabaseName === db.name ? '#5865F2' : '#313338'}; 
                                    display: flex; align-items: center; justify-content: center;
                                    color: white; font-weight: bold; font-size: 16px;
                                    transition: all 0.2s;
                                    margin-bottom: 12px;
                                    text-decoration: none;
                                `}
                                onmouseover="this.style.borderRadius='12px'; this.style.backgroundColor='#5865F2';"
                                onmouseout={`this.style.borderRadius='12px'; this.style.backgroundColor='${props.currentDatabaseName === db.name ? '#5865F2' : '#313338'}';`}
                            >
                                {db.name.substring(0, 2).toUpperCase()}
                            </a>
                        ))}
                    </div>
                )}

                {/* Level 2 Sidebar (Context Menu) */}
                <div class="column is-2 has-background-white-bis" style="border-right: 1px solid #dbdbdb; min-width: 220px; max-width: 260px;">
                    <aside class="menu section py-5 px-4">
                        <div class="mb-4 px-2">
                            {props.currentDatabaseName && (
                                <h3 class="title is-6 has-text-grey-dark is-uppercase" style="letter-spacing: 0.5px;">
                                    {props.currentDatabaseName}
                                </h3>
                            )}
                        </div>
                        <ul class="menu-list">
                            {props.currentProjectId ? (
                                <>
                                    <li>
                                        <a href={`/ui/projects/${props.currentProjectId}?db=${props.currentDatabaseName || ''}`} class={props.active === 'projects' && !props.children?.props?.title?.startsWith('Collection') ? 'is-active' : ''}>
                                            <span class="icon-text">
                                                <span>Dashboard</span>
                                            </span>
                                        </a>
                                    </li>
                                    {props.currentDatabaseName && (
                                        <li>
                                            <p class="menu-label mt-5 mb-2">Collections</p>
                                            <ul>
                                                {props.collections?.map((col: any) => (
                                                    <li>
                                                        <a
                                                            href={`/ui/projects/${props.currentProjectId}/collections/${col.name}?db=${props.currentDatabaseName}`}
                                                            class={props.children?.props?.children?.[0]?.props?.children?.[2]?.props?.children === col.name ? 'is-active' : ''}
                                                        >
                                                            {col.name}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    )}
                                </>
                            ) : (
                                <>
                                    <li><a href="/ui/projects" class={props.active === 'projects' ? 'is-active' : ''}>Projects</a></li>
                                </>
                            )}
                        </ul>
                    </aside>
                </div>

                {/* Main Content */}
                <div class="column">
                    <section class="section">
                        {props.children}
                    </section>
                </div>
            </div>
        </body>
    </html>
)
