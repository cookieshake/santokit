import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getContainerRuntimeClient } from 'testcontainers';
import type { FlowContext } from './global-setup.ts';

const projectRoot = path.resolve(__dirname, '../../../../../');
const contextFile = path.join(projectRoot, 'tmp-integration-context.json');
const lockFile = path.join(projectRoot, '.tmp-integration-lock');
const projectDirContainer = '/workspace/tmp-integration-project';
const scriptsRootContainer = '/workspace/tmp-integration-project/scripts';
const localScriptsDir = path.resolve(__dirname, '../scripts');

let cachedContext: FlowContext | null = null;
let lockHeld = false;

async function withProjectLock<T>(task: () => Promise<T>): Promise<T> {
  if (lockHeld) {
    return task();
  }
  while (true) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      lockHeld = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try {
    return await task();
  } finally {
    lockHeld = false;
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // ignore
    }
  }
}

function readContextFile() {
  if (!fs.existsSync(contextFile)) {
    throw new Error('Flow context not initialized');
  }
  return JSON.parse(fs.readFileSync(contextFile, 'utf8')) as {
    hubUrl: string;
    apiUrl: string;
    apiUrlInternal: string;
    projectDir: string;
    projectDirContainer: string;
    scriptsRootContainer: string;
    cliContainerId: string;
    clientContainerId: string;
    postgresContainerId: string;
  };
}

function normalizeExecOutput(output: { output?: string; stdout?: string; stderr?: string }) {
  return (output.stdout || output.stderr || output.output || '').trim();
}

async function execInContainer(containerId: string, command: string) {
  const client = await getContainerRuntimeClient();
  const container = client.container.getById(containerId);
  const result = await client.container.exec(container, ['bash', '-lc', command]);
  if (result.exitCode !== 0) {
    throw new Error(normalizeExecOutput(result));
  }
  return result;
}

async function execInContainerAllowFailure(containerId: string, command: string) {
  const client = await getContainerRuntimeClient();
  const container = client.container.getById(containerId);
  return client.container.exec(container, ['bash', '-lc', command]);
}

async function execInPostgres(containerId: string, sql: string) {
  const escaped = sql.replace(/"/g, '\\"');
  await execInContainer(containerId, `psql -U postgres -d santokit -c "${escaped}"`);
}

function createTarStream(source: string) {
  const tar = spawn('tar', ['--no-xattrs', '--no-mac-metadata', '-C', source, '-cf', '-', '.']);
  return tar;
}

async function copyDirectoryToContainer(containerId: string, source: string, target: string) {
  const client = await getContainerRuntimeClient();
  const container = client.container.getById(containerId);
  await client.container.exec(container, ['mkdir', '-p', target]);
  const tar = createTarStream(source);
  const stderrChunks: string[] = [];

  tar.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));

  const exitPromise = new Promise<void>((resolve, reject) => {
    tar.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderrChunks.join('') || `tar exited with code ${code}`));
      }
    });
    tar.on('error', reject);
  });

  await client.container.putArchive(container, tar.stdout, target);
  await exitPromise;
}

async function runCli(containerId: string, command: string, cwd = projectDirContainer) {
  await execInContainer(containerId, `export PATH=\"/usr/local/go/bin:$PATH\"; cd ${cwd} && ${command}`);
}

async function execInClient(containerId: string, command: string) {
  const result = await execInContainerAllowFailure(containerId, command);
  return { exitCode: result.exitCode ?? 1, output: result.output ?? '' };
}

function writeProjectFiles(projectDir: string) {
  const schemaDir = path.join(projectDir, 'schema');
  const configDir = path.join(projectDir, 'config');
  const logicDir = path.join(projectDir, 'logic');

  fs.mkdirSync(schemaDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(path.join(logicDir, 'echo'), { recursive: true });
  fs.mkdirSync(path.join(logicDir, 'cache'), { recursive: true });
  fs.mkdirSync(path.join(logicDir, 'storage'), { recursive: true });

  // Test schema with column prefixes
  const testSchema = `
table "test_users" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  
  column "name" {
    type = varchar(255)
  }
  
  column "s_email" {
    type = varchar(255)
  }
  
  column "c_password_hash" {
    type = text
  }
  
  column "c_ssn" {
    type = varchar(11)
  }
  
  column "p_internal_notes" {
    type = text
  }
  
  column "p_ban_reason" {
    type = text
  }
  
  column "_created_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  column "_updated_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  primary_key {
    columns = [column.id]
  }
}

table "test_orders" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  
  column "user_id" {
    type = uuid
  }
  
  column "status" {
    type = varchar(50)
  }
  
  column "_created_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  primary_key {
    columns = [column.id]
  }
}

table "test_public_posts" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  
  column "title" {
    type = varchar(255)
  }
  
  column "content" {
    type = text
  }
  
  primary_key {
    columns = [column.id]
  }
}

table "items" {
  schema = schema.public
}
`;

  fs.writeFileSync(path.join(schemaDir, 'main.hcl'), testSchema);

  // Permissions config
  const permissionsConfig = `
ownerColumn:
  _default: user_id
  test_users: id

tables:
  _default:
    select: [authenticated]
    insert: [authenticated]
    update: [owner, admin]
    delete: [admin]
  
  test_users:
    select: [public]
    insert: [public]
    update: [public]
    delete: [public]
    columns:
      id:
        select: [public]
      name:
        select: [public]
      s_email:
        select: [public]
      _created_at:
        select: [public]
        insert: []
        update: []
      _updated_at:
        select: [public]
        insert: []
        update: []
  
  test_orders:
    select: [authenticated]
    insert: [authenticated]
    update: [owner, admin]
    delete: [owner, admin]
  
  test_public_posts:
    select: [public]
    insert: [authenticated]
    update: [owner, admin]
    delete: [admin]
`;

  fs.writeFileSync(path.join(configDir, 'permissions.yaml'), permissionsConfig);
  fs.writeFileSync(path.join(configDir, 'auth.yaml'), 'providers: []\n');
  fs.writeFileSync(
    path.join(configDir, 'databases.yaml'),
    'default:\n  url: postgres://postgres:password@postgres:5432/santokit?sslmode=disable\n'
  );

  const stkConfig = {
    project_id: 'default',
    codegen: { output: '.stk/santokit-env.d.ts' }
  };
  fs.writeFileSync(path.join(projectDir, 'stk.config.json'), JSON.stringify(stkConfig, null, 2));

  fs.writeFileSync(path.join(logicDir, 'echo', 'ping.js'), `---\naccess: public\nparams:\n  message:\n    type: string\n    required: true\n---\n\nexport default async function (params) {\n  return { echo: params.message };\n}\n`);

  fs.writeFileSync(path.join(logicDir, 'cache', 'ping.js'), `---\naccess: public\ncache: "1m"\n---\n\nexport default async function () {\n  return { ts: Date.now() };\n}\n`);

  fs.writeFileSync(path.join(logicDir, 'storage', 'presign.js'), `---\naccess: public\n---\n\nexport default async function (_params, context) {\n  const uploadUrl = await context.storage.createUploadUrl('test', 'file.txt');\n  const downloadUrl = await context.storage.createDownloadUrl('test', 'file.txt');\n  return { uploadUrl, downloadUrl };\n}\n`);

  fs.writeFileSync(path.join(logicDir, 'storage', 'delete.js'), `---\naccess: public\n---\n\nexport default async function (_params, context) {\n  try {\n    await context.storage.delete('test', 'file.txt');\n  } catch (error) {\n    return { deleted: true, error: String(error) };\n  }\n  return { deleted: true };\n}\n`);
}

export function getFlowContext(): FlowContext {
  if (cachedContext) return cachedContext;

  const base = readContextFile();
  const projectDir = base.projectDir;
  const runCliBound = (command: string, cwd?: string) => runCli(base.cliContainerId, command, cwd);
  const execInClientBound = (command: string) => execInClient(base.clientContainerId, command);
  const postgresContainerId = base.postgresContainerId;

  let projectPrepared = false;
  let logicApplied = false;

  async function ensureProjectPrepared() {
    if (projectPrepared && fs.existsSync(path.join(projectDir, 'logic'))) return;
    await withProjectLock(async () => {
      if (projectPrepared && fs.existsSync(path.join(projectDir, 'logic'))) return;
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      fs.mkdirSync(projectDir, { recursive: true });
      await runCliBound(`go run /workspace/packages/cli/cmd/stk/main.go init ${projectDirContainer}`, '/workspace');
      const logicDir = path.join(projectDir, 'logic');
      if (fs.existsSync(logicDir)) {
        fs.rmSync(logicDir, { recursive: true, force: true });
      }
      writeProjectFiles(projectDir);

      // Copy the locally generated files into the container volume
      try {
        await copyDirectoryToContainer(base.cliContainerId, projectDir, projectDirContainer);
        // Also copy the scripts directory
        await copyDirectoryToContainer(base.cliContainerId, localScriptsDir, `${projectDirContainer}/scripts`);
      } catch (e) {
        console.error('Failed to copy files to container:', e);
        throw e;
      }
      projectPrepared = true;
    });
  }

  async function ensureLogicApplied() {
    if (logicApplied) return;
    await withProjectLock(async () => {
      if (logicApplied) return;
      await ensureProjectPrepared();
      await execInPostgres(postgresContainerId, 'CREATE EXTENSION IF NOT EXISTS pgcrypto;');
      await execInPostgres(postgresContainerId, 'CREATE TABLE IF NOT EXISTS test_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(255), s_email varchar(255), c_password_hash text, c_ssn varchar(11), p_internal_notes text, p_ban_reason text, _created_at timestamptz DEFAULT now(), _updated_at timestamptz DEFAULT now());');
      await execInPostgres(postgresContainerId, 'CREATE TABLE IF NOT EXISTS test_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status varchar(50), _created_at timestamptz DEFAULT now());');
      await execInPostgres(postgresContainerId, 'CREATE TABLE IF NOT EXISTS test_public_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(255), content text);');
      await execInPostgres(postgresContainerId, 'CREATE TABLE IF NOT EXISTS items (id uuid PRIMARY KEY DEFAULT gen_random_uuid());');
      await runCliBound('stk schema apply -y', projectDirContainer);
      await runCliBound('stk config apply', projectDirContainer);
      await runCliBound('go run /workspace/packages/cli/cmd/stk/main.go logic apply', projectDirContainer);
      logicApplied = true;
    });
  }

  cachedContext = {
    hubUrl: base.hubUrl,
    apiUrl: base.apiUrl,
    apiUrlInternal: base.apiUrlInternal ?? 'http://bridge:3000',
    projectDir: base.projectDir,
    projectDirContainer: base.projectDirContainer,
    scriptsRootContainer: base.scriptsRootContainer ?? scriptsRootContainer,
    cliContainerId: base.cliContainerId,
    clientContainerId: base.clientContainerId,
    runCli: runCliBound,
    execInClient: execInClientBound,
    ensureProjectPrepared,
    ensureLogicApplied
  };

  return cachedContext;
}
