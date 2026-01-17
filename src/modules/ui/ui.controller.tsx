/** @jsxImportSource hono/jsx */
import { Hono } from 'hono'
import { projectService } from '@/modules/project/project.service.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { dataService } from '@/modules/data/data.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
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

    let collections: any[] = []
    let currentDatabaseName = ''
    let databases: any[] = []
    try {
        databases = await projectRepository.findDatabasesByProjectId(projectId)
        if (databases.length > 0) {
            // For UI simplicity, just load from the first database for now
            // or we might need to update UI to support multiple DBs later
            currentDatabaseName = databases[0].name
            collections = await collectionService.listByDatabase(databases[0].id)
        }
    } catch (e) {
        console.error('Failed to load collections', e)
    }

    const projects = await projectService.list()
    const account = c.get('account')

    return c.html(<ProjectDetail project={project} currentDatabaseName={currentDatabaseName} databases={databases} collections={collections} projects={projects} account={account} />)
})

app.get('/projects/:id/collections/:colName', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const collectionName = c.req.param('colName')
    const account = c.get('account')

    try {
        const databases = await projectRepository.findDatabasesByProjectId(projectId)
        if (databases.length === 0) throw new Error('No databases found')
        const dbId = databases[0].id

        const detail = await collectionService.getDetail(dbId, collectionName)
        const rows = (await dataService.findAll(dbId, collectionName)) as any[]
        const projects = await projectService.list()

        const collections = await collectionService.listByDatabase(dbId)

        return c.html(
            <CollectionDetail
                projectId={projectId}
                currentDatabaseName={databases[0].name}
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
