/** @jsxImportSource hono/jsx */
import { Hono } from 'hono'
import { projectService } from '@/modules/project/project.service.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { dataService } from '@/modules/data/data.service.js'
import { db } from '@/db/index.js'
import { sql } from 'drizzle-orm'
import { Login } from './pages/login.js'

import { Projects } from './pages/projects.js'
import { ProjectDetail } from './pages/project-detail.js'
import { CollectionDetail } from './pages/collection-detail.js'

import { Layout } from './components/layout.js'

const app = new Hono<{
    Variables: {
        account: any;
    };
}>()

app.get('/login', (c) => {
    return c.html(<Login />)
})

app.get('/', (c) => {
    return c.redirect('/ui/projects')
})

app.get('/projects', async (c) => {
    const projects = await projectService.list()
    const account = c.get('account')
    return c.html(<Projects projects={projects} account={account} />)
})

app.get('/projects/:id', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const project = await projectService.getById(projectId)
    if (!project) return c.notFound()

    const collections = await collectionService.listByProject(projectId)
    const projects = await projectService.list()
    const account = c.get('account')

    return c.html(<ProjectDetail project={project} collections={collections} projects={projects} account={account} />)
})

app.get('/projects/:id/collections/:colName', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const collectionName = c.req.param('colName')
    const account = c.get('account')

    try {
        const detail = await collectionService.getDetail(projectId, collectionName)
        const rows = (await dataService.findAll(projectId, collectionName)) as any[]
        const projects = await projectService.list()

        const collections = await collectionService.listByProject(projectId)

        return c.html(
            <CollectionDetail
                projectId={projectId}
                collectionName={collectionName}
                detail={detail}
                rows={rows}
                account={account}
                projects={projects}
                collections={collections}
            />
        )
    } catch (e) {
        return c.html(<Layout title="Error" active="projects" account={c.get('account')}><div class="notification is-danger">Error: {String(e)}</div></Layout>)
    }
})



export default app
