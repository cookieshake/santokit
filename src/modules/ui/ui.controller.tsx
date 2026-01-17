/** @jsxImportSource hono/jsx */
import { Hono } from 'hono'
import { projectService } from '@/modules/project/project.service.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { dataService } from '@/modules/data/data.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { Login } from './pages/login.js'

import { Projects } from './pages/projects.js'
import { ProjectDetail } from './pages/project-detail.js'
import { CollectionDetail } from './pages/collection-detail.js'
import { deleteCookie } from 'hono/cookie'
import { CONSTANTS } from '@/constants.js'

import { Layout } from './components/layout.js'

const app = new Hono<{
    Variables: {
        account: any;
    };
}>()

app.get('/login', (c) => {
    return c.html(<Login />)
})

app.get('/logout', (c) => {
    deleteCookie(c, CONSTANTS.AUTH.COOKIE_NAME)
    return c.redirect('/ui/login')
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
            const dbNameParam = c.req.query('db')
            const selectedDb = dbNameParam ? databases.find(d => d.name === dbNameParam) || databases[0] : databases[0]
            currentDatabaseName = selectedDb.name
            collections = await collectionService.listByDatabase(selectedDb.id)
        }
    } catch (e) {
        console.error('Failed to load collections', e)
    }

    const projects = await projectService.list()
    const account = c.get('account')

    return c.html(<ProjectDetail project={project} currentDatabaseName={currentDatabaseName} databases={databases || []} collections={collections || []} projects={projects || []} account={account} />)
})

app.get('/projects/:id/collections/:colName', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const collectionName = c.req.param('colName')
    const account = c.get('account')

    try {
        const databases = await projectRepository.findDatabasesByProjectId(projectId)
        if (databases.length === 0) throw new Error('No databases found')

        const dbNameParam = c.req.query('db')
        const selectedDb = dbNameParam ? databases.find(d => d.name === dbNameParam) || databases[0] : databases[0]
        const dbId = selectedDb.id

        const detail = await collectionService.getDetail(dbId, collectionName)
        const rows = (await dataService.findAll(dbId, collectionName)) as any[]
        const projects = await projectService.list()

        const collections = await collectionService.listByDatabase(dbId)

        // Fetch policies for this collection
        const { policyService } = await import('@/modules/policy/policy.service.js')
        const allPolicies = await policyService.list(projectId, dbId)
        const policies = allPolicies.filter((p: any) => p.collection_name === collectionName)

        return c.html(
            <CollectionDetail
                projectId={projectId}
                currentDatabaseName={databases[0].name}
                collectionName={collectionName}
                detail={detail}
                rows={rows}
                policies={policies}
                account={account}
                projects={projects}
                collections={collections}
                databases={databases}
            />
        )
    } catch (e) {
        return c.html(<Layout title="Error" active="projects" account={c.get('account')}><div class="notification is-danger">Error: {String(e)}</div></Layout>)
    }
})

export default app
