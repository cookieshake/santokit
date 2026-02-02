import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const projectRoot = path.resolve(__dirname, '../../../../../');
const scriptsRootContainer = '/workspace/packages/integration-tests/test/integration/scripts';

const networkName = 'santokit-it';
const names = {
  redis: 'santokit-it-redis',
  postgres: 'santokit-it-postgres',
  hub: 'santokit-it-hub',
  bridge: 'santokit-it-bridge',
  cli: 'santokit-it-cli',
  client: 'santokit-it-client',
  user: 'santokit-it-user'
};

const images = {
  hub: 'santokit-hub-test:latest',
  bridge: 'santokit-server-test:latest',
  cli: 'santokit-cli-test:latest',
  node: 'santokit-node-test:latest'
};

const ports = {
  hub: 55880,
  bridge: 55830
};

type FlowContext = {
  hubUrl: string;
  apiUrl: string;
  apiUrlInternal: string;
  projectDir: string;
  projectDirContainer: string;
  scriptsRootContainer: string;
  runCli: (command: string, cwd?: string) => Promise<void>;
  execInClient: (command: string) => Promise<{ exitCode: number; output: string }>;
  ensureProjectPrepared: () => Promise<void>;
  ensureLogicApplied: () => Promise<void>;
};

export type { FlowContext };

const contextFile = path.join(projectRoot, 'tmp-integration-context.json');

function runDocker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function dockerOk(args: string[]): boolean {
  try {
    execFileSync('docker', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureNetwork() {
  if (!dockerOk(['network', 'inspect', networkName])) {
    try {
      runDocker(['network', 'create', networkName]);
    } catch (error: any) {
      const stderr = error?.stderr?.toString?.() ?? '';
      if (!stderr.includes('already exists')) {
        throw error;
      }
    }
  }
}

function imageExists(image: string): boolean {
  return dockerOk(['image', 'inspect', image]);
}

function buildImage(image: string, dockerfile: string) {
  runDocker(['build', '-t', image, '-f', dockerfile, projectRoot]);
}

function containerExists(name: string): boolean {
  return dockerOk(['container', 'inspect', name]);
}

function containerRunning(name: string): boolean {
  if (!containerExists(name)) return false;
  const running = runDocker(['inspect', '-f', '{{.State.Running}}', name]);
  return running === 'true';
}

function containerHasAliases(name: string, aliases: string[]): boolean {
  try {
    const networksJson = runDocker(['inspect', '-f', '{{json .NetworkSettings.Networks}}', name]);
    const networks = JSON.parse(networksJson) as Record<string, { Aliases?: string[] }>;
    const entry = networks[networkName];
    if (!entry || !entry.Aliases) return false;
    return aliases.every((alias) => entry.Aliases?.includes(alias));
  } catch {
    return false;
  }
}

function ensureContainer(name: string, runArgs: string[], aliases: string[] = []) {
  if (containerExists(name) && aliases.length > 0 && !containerHasAliases(name, aliases)) {
    runDocker(['rm', '-f', name]);
  }
  if (containerRunning(name)) return;
  if (containerExists(name)) {
    runDocker(['start', name]);
    return;
  }
  const aliasArgs = aliases.flatMap((alias) => ['--network-alias', alias]);
  runDocker(['run', '-d', '--name', name, '--network', networkName, ...aliasArgs, ...runArgs]);
}

function resetState() {
  if (containerRunning(names.redis)) {
    runDocker(['exec', names.redis, 'redis-cli', 'FLUSHALL']);
  }
  if (containerRunning(names.postgres)) {
    runDocker([
      'exec',
      names.postgres,
      'psql',
      '-U',
      'postgres',
      '-d',
      'santokit',
      '-c',
      'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    ]);
  }
  if (containerRunning(names.hub)) runDocker(['restart', names.hub]);
  if (containerRunning(names.bridge)) runDocker(['restart', names.bridge]);
}

function waitForRedis(attempts = 30, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const output = runDocker(['exec', names.redis, 'redis-cli', 'PING']);
      if (output.trim() === 'PONG') return;
    } catch {
      // ignore and retry
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  throw new Error('Redis not ready');
}

function waitForPostgres(attempts = 30, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      runDocker(['exec', names.postgres, 'pg_isready', '-U', 'postgres']);
      return;
    } catch {
      // ignore and retry
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  throw new Error('Postgres not ready');
}

async function startFlowContext(): Promise<{ ctx: FlowContext; cleanup: () => Promise<void> }> {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'santokit-home-'));
  const projectDir = path.join(projectRoot, 'tmp-integration-project');
  const projectDirContainer = '/workspace/tmp-integration-project';

  if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });

  ensureNetwork();

  if (!imageExists(images.hub)) {
    buildImage(images.hub, path.join(projectRoot, 'packages/integration-tests/test/integration/Dockerfile.hub'));
  }
  buildImage(images.bridge, path.join(projectRoot, 'packages/integration-tests/test/integration/Dockerfile.server'));
  if (!imageExists(images.cli)) {
    buildImage(images.cli, path.join(projectRoot, 'packages/integration-tests/test/integration/Dockerfile.cli'));
  }
  if (!imageExists(images.node)) {
    buildImage(images.node, path.join(projectRoot, 'packages/integration-tests/test/integration/Dockerfile.node'));
  }

  ensureContainer(names.redis, ['redis:7-alpine'], ['redis']);
  ensureContainer(names.postgres, [
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_PASSWORD=password',
    '-e',
    'POSTGRES_DB=santokit',
    'postgres:15-alpine'
  ], ['postgres']);

  waitForRedis();
  waitForPostgres();

  ensureContainer(names.hub, [
    '-p',
    `${ports.hub}:8080`,
    '-e',
    'STK_HUB_ADDR=:8080',
    '-e',
    'STK_DISABLE_AUTH=true',
    '-e',
    'STK_KV_REDIS=redis://redis:6379',
    '-e',
    'STK_DATABASE_URL=postgres://postgres:password@postgres:5432/santokit?sslmode=disable',
    images.hub
  ], ['hub']);

  ensureContainer(names.bridge, [
    '-p',
    `${ports.bridge}:3000`,
    '-e',
    'REDIS_URL=redis://redis:6379',
    '-e',
    'DATABASE_URL=postgres://postgres:password@postgres:5432/santokit?sslmode=disable',
    '-e',
    'STK_ENCRYPTION_KEY=32-byte-key-for-aes-256-gcm!!!!!',
    '-e',
    'STORAGE_ENDPOINT=http://user:80',
    '-e',
    'STORAGE_ACCESS_KEY_ID=test-access',
    '-e',
    'STORAGE_SECRET_ACCESS_KEY=test-secret',
    '-e',
    'STORAGE_REGION=auto',
    images.bridge
  ], ['bridge']);

  ensureContainer(names.user, ['nginx:1.27-alpine'], ['user']);

  ensureContainer(names.cli, [
    '-v',
    `${projectRoot}:/workspace`,
    '-v',
    `${homeDir}:/data/home`,
    '-e',
    'HOME=/data/home',
    '-e',
    'STK_HUB_URL=http://hub:8080',
    '-e',
    'STK_PROJECT_ID=default',
    '-e',
    'STK_TOKEN=test-token',
    '-e',
    'STK_DISABLE_AUTH=true',
    images.cli,
    'sleep',
    'infinity'
  ], ['cli']);

  ensureContainer(names.client, [
    '-v',
    `${projectRoot}:/workspace`,
    images.node,
    'sleep',
    'infinity'
  ], ['client']);

  resetState();

  const hubUrl = `http://127.0.0.1:${ports.hub}`;
  const apiUrl = `http://127.0.0.1:${ports.bridge}`;

  async function waitForHttp(url: string, attempts = 60, delayMs = 500) {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {
        // ignore and retry
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(`Health check failed: ${url}`);
  }

  await waitForHttp(`${hubUrl}/health`);
  await waitForHttp(`${apiUrl}/health`);

  async function runCli(command: string, cwd = projectDirContainer) {
    try {
      execFileSync('docker', [
      'exec',
      names.cli,
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

  async function execInClient(command: string) {
    try {
      const output = execFileSync('docker', ['exec', names.client, 'bash', '-lc', command], { encoding: 'utf8' });
      return { exitCode: 0, output };
    } catch (error: any) {
      const output = error?.stdout?.toString?.() ?? error?.stderr?.toString?.() ?? '';
      return { exitCode: error?.status ?? 1, output };
    }
  }

  let projectPrepared = false;
  let logicApplied = false;

  function writeProjectFiles() {
    fs.mkdirSync(projectDir, { recursive: true });

    const schemaDir = path.join(projectDir, 'schema');
    const configDir = path.join(projectDir, 'config');
    const logicDir = path.join(projectDir, 'logic');

    fs.mkdirSync(schemaDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(path.join(logicDir, 'echo'), { recursive: true });
    fs.mkdirSync(path.join(logicDir, 'cache'), { recursive: true });
    fs.mkdirSync(path.join(logicDir, 'storage'), { recursive: true });

    fs.writeFileSync(path.join(schemaDir, 'main.hcl'), 'table "items" { schema = schema.public }\n');
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

    fs.writeFileSync(path.join(logicDir, 'storage', 'delete.js'), `---\naccess: public\n---\n\nexport default async function (_params, context) {\n  await context.storage.delete('test', 'file.txt');\n  return { deleted: true };\n}\n`);
  }

  async function ensureProjectPrepared() {
    if (projectPrepared) return;
    await runCli(`go run /workspace/packages/cli/cmd/stk/main.go init ${projectDirContainer}`, '/workspace');
    writeProjectFiles();
    projectPrepared = true;
  }

  async function ensureLogicApplied() {
    if (logicApplied) return;
    await ensureProjectPrepared();
    await runCli('go run /workspace/packages/cli/cmd/stk/main.go logic apply', projectDirContainer);
    logicApplied = true;
  }

  const ctx: FlowContext = {
    hubUrl,
    apiUrl,
    apiUrlInternal: 'http://bridge:3000',
    projectDir,
    projectDirContainer,
    scriptsRootContainer,
    runCli,
    execInClient,
    ensureProjectPrepared,
    ensureLogicApplied
  };

  const cleanup = async () => {
    // Intentionally no-op to reuse containers across runs.
  };

  return { ctx, cleanup };
}

export { startFlowContext };

export default async function globalSetup() {
  const { ctx } = await startFlowContext();
  const serialized = {
    hubUrl: ctx.hubUrl,
    apiUrl: ctx.apiUrl,
    apiUrlInternal: ctx.apiUrlInternal,
    projectDir: ctx.projectDir,
    projectDirContainer: ctx.projectDirContainer,
    scriptsRootContainer: ctx.scriptsRootContainer
  };
  fs.writeFileSync(contextFile, JSON.stringify(serialized, null, 2));
  return async () => {
    // Intentionally no-op to reuse containers across runs.
  };
}
