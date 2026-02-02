import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { DockerComposeEnvironment, Wait } from 'testcontainers';

const projectRoot = path.resolve(__dirname, '../../../../../');
const scriptsRootContainer = '/workspace/packages/integration-tests/test/integration/scripts';
const composeFilePath = projectRoot;
const composeFile = 'docker-compose.yml';
const services = {
  redis: 'redis',
  postgres: 'postgres',
  hub: 'hub',
  bridge: 'bridge',
  cli: 'cli',
  client: 'client',
  user: 'user'
};

type FlowContext = {
  hubUrl: string;
  apiUrl: string;
  apiUrlInternal: string;
  projectDir: string;
  projectDirContainer: string;
  scriptsRootContainer: string;
  cliContainerId: string;
  clientContainerId: string;
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

function containerRunning(id: string): boolean {
  if (!dockerOk(['container', 'inspect', id])) return false;
  const running = runDocker(['inspect', '-f', '{{.State.Running}}', id]);
  return running === 'true';
}

function getServiceContainer(environment: Awaited<ReturnType<DockerComposeEnvironment['up']>>, service: string) {
  try {
    return environment.getContainer(`${service}-1`);
  } catch {
    return environment.getContainer(`${service}_1`);
  }
}

function withServiceWaitStrategy(
  environment: DockerComposeEnvironment,
  service: string,
  strategy: ReturnType<typeof Wait.forHttp> | ReturnType<typeof Wait.forLogMessage> | ReturnType<typeof Wait.forHealthCheck>
) {
  return environment
    .withWaitStrategy(`${service}-1`, strategy)
    .withWaitStrategy(`${service}_1`, strategy);
}

function resetState(containerIds: { redis: string; postgres: string; hub: string; bridge: string }) {
  if (containerRunning(containerIds.redis)) {
    runDocker(['exec', containerIds.redis, 'redis-cli', 'FLUSHALL']);
  }
  if (containerRunning(containerIds.postgres)) {
    runDocker([
      'exec',
      containerIds.postgres,
      'psql',
      '-U',
      'postgres',
      '-d',
      'santokit',
      '-c',
      'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    ]);
  }
  if (containerRunning(containerIds.hub)) runDocker(['restart', containerIds.hub]);
  if (containerRunning(containerIds.bridge)) runDocker(['restart', containerIds.bridge]);
}

function waitForRedis(containerId: string, attempts = 30, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const output = runDocker(['exec', containerId, 'redis-cli', 'PING']);
      if (output.trim() === 'PONG') return;
    } catch {
      // ignore and retry
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  throw new Error('Redis not ready');
}

function waitForPostgres(containerId: string, attempts = 30, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      runDocker(['exec', containerId, 'pg_isready', '-U', 'postgres']);
      return;
    } catch {
      // ignore and retry
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  throw new Error('Postgres not ready');
}

async function startFlowContext(): Promise<{ ctx: FlowContext; cleanup: () => Promise<void> }> {
  const projectDir = path.join(projectRoot, 'tmp-integration-project');
  const projectDirContainer = '/workspace/tmp-integration-project';

  if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });

  let environment = new DockerComposeEnvironment(composeFilePath, composeFile).withBuild();
  environment = withServiceWaitStrategy(environment, services.hub, Wait.forHttp('/health', 8080));
  environment = withServiceWaitStrategy(environment, services.bridge, Wait.forHttp('/health', 3000));
  environment = await environment.up();

  const redisContainer = getServiceContainer(environment, services.redis);
  const postgresContainer = getServiceContainer(environment, services.postgres);
  const hubContainer = getServiceContainer(environment, services.hub);
  const bridgeContainer = getServiceContainer(environment, services.bridge);
  const cliContainer = getServiceContainer(environment, services.cli);
  const clientContainer = getServiceContainer(environment, services.client);
  const userContainer = getServiceContainer(environment, services.user);

  const containerIds = {
    redis: redisContainer.getId(),
    postgres: postgresContainer.getId(),
    hub: hubContainer.getId(),
    bridge: bridgeContainer.getId(),
    cli: cliContainer.getId(),
    client: clientContainer.getId(),
    user: userContainer.getId()
  };

  waitForRedis(containerIds.redis);
  waitForPostgres(containerIds.postgres);

  resetState(containerIds);

  const hubUrl = `http://${hubContainer.getHost()}:${hubContainer.getMappedPort(8080)}`;
  const apiUrl = `http://${bridgeContainer.getHost()}:${bridgeContainer.getMappedPort(3000)}`;

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
        containerIds.cli,
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
      const output = execFileSync('docker', ['exec', containerIds.client, 'bash', '-lc', command], { encoding: 'utf8' });
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
    cliContainerId: containerIds.cli,
    clientContainerId: containerIds.client,
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
    scriptsRootContainer: ctx.scriptsRootContainer,
    cliContainerId: ctx.cliContainerId,
    clientContainerId: ctx.clientContainerId
  };
  fs.writeFileSync(contextFile, JSON.stringify(serialized, null, 2));
  return async () => {
    // Intentionally no-op to reuse containers across runs.
  };
}
