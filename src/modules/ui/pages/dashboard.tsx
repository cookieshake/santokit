/** @jsxImportSource hono/jsx */
import { Layout } from '../components/layout.js'

export const Dashboard = (props: { projects: any[]; admins: any[] }) => (
    <Layout title="Dashboard" active="dashboard" projects={props.projects}>
        <h1 class="title">Dashboard</h1>

        <div class="columns">
            <div class="column">
                <div class="notification is-link">
                    <p class="heading">Total Projects</p>
                    <p class="title">{props.projects.length}</p>
                </div>
            </div>
            <div class="column">
                <div class="notification is-primary">
                    <p class="heading">Active Admins</p>
                    <p class="title">{props.admins.length}</p>
                </div>
            </div>
        </div>

        <div class="box">
            <h2 class="title is-4">Recent Projects</h2>
            <div class="table-container">
                <table class="table is-fullwidth is-striped is-hoverable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Created At</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.projects.slice(0, 5).map(p => (
                            <tr>
                                <td>{p.name}</td>
                                <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-'}</td>
                                <td><span class="tag is-success">Active</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </Layout>
)
