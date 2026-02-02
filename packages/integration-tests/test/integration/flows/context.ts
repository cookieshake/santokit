import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { FlowContext } from './global-setup.ts';

const projectRoot = path.resolve(__dirname, '../../../../../');
const contextFile = path.join(projectRoot, 'tmp-integration-context.json');
const lockFile = path.join(projectRoot, '.tmp-integration-lock');
const projectDirContainer = '/workspace/tmp-integration-project';
const scriptsRootContainer = '/workspace/packages/integration-tests/test/integration/scripts';

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
  };
}

async function runCli(containerId: string, command: string, cwd = projectDirContainer) {
  try {
    execFileSync('docker', [
      'exec',
      containerId,
      'bash',
      '-lc',
      `export PATH=\"/usr/local/go/bin:$PATH\"; cd ${cwd} && ${command}`
    ], { encoding: 'utf8' });
  } catch (error: any) {
    const stdout = error?.stdout?.toString?.() ?? '';
    const stderr = error?.stderr?.toString?.() ?? '';
    const message = (stdout || stderr || String(error)).trim();
    throw new Error(message);
  }
}

async function execInClient(containerId: string, command: string) {
  try {
    const output = execFileSync('docker', ['exec', containerId, 'bash', '-lc', command], { encoding: 'utf8' });
    return { exitCode: 0, output };
  } catch (error: any) {
    const output = error?.stdout?.toString?.() ?? error?.stderr?.toString?.() ?? '';
    return { exitCode: error?.status ?? 1, output };
  }
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
    select: [authenticated]
    insert: [public]
    update: [owner, admin]
    delete: [admin]
  
  test_orders:
    select: [owner, admin]
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
  fs.writeFileSync(path.join(configDir, 'databases.yaml'), 'default: {}\n');

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
      projectPrepared = true;
    });
  }

  async function ensureLogicApplied() {
    if (logicApplied) return;
    await withProjectLock(async () => {
      if (logicApplied) return;
      await ensureProjectPrepared();
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
