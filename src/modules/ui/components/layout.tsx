/** @jsxImportSource hono/jsx */

export const Layout = (props: { title: string; children: any; active: string; account?: any; projects?: any[]; currentProjectId?: number; collections?: any[] }) => (
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
                            {props.currentProjectId ? (
                                <>
                                    <li><a href={`/ui/projects/${props.currentProjectId}`} class={props.active === 'projects' && !props.children?.props?.title?.startsWith('Collection') ? 'is-active' : ''}>Overview</a></li>
                                    <li>
                                        <p class="menu-label mt-4">Collections</p>
                                        <ul>
                                            {props.collections?.map((col: any) => (
                                                <li>
                                                    <a href={`/ui/projects/${props.currentProjectId}/collections/${col.name}`} class={props.children?.props?.children?.[0]?.props?.children?.[2]?.props?.children === col.name ? 'is-active' : ''}>
                                                        {col.name}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                </>
                            ) : (
                                <>
                                    <li><a href="/ui" class={props.active === 'dashboard' ? 'is-active' : ''}>Dashboard</a></li>
                                    <li><a href="/ui/projects" class={props.active === 'projects' ? 'is-active' : ''}>Projects</a></li>
                                    <li><a href="/ui/admins" class={props.active === 'admins' ? 'is-active' : ''}>Admins</a></li>
                                </>
                            )}
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
