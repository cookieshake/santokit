import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { DockerComposeEnvironment, Wait, getContainerRuntimeClient, GenericContainer } from 'testcontainers';

const projectRoot = path.resolve(__dirname, '../../../../../');
const scriptsRootContainer = '/workspace/tmp-integration-project/scripts';
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
  postgresContainerId: string;
  runCli: (command: string, cwd?: string) => Promise<void>;
  execInClient: (command: string) => Promise<{ exitCode: number; output: string }>;
  ensureProjectPrepared: () => Promise<void>;
  ensureLogicApplied: () => Promise<void>;
};

export type { FlowContext };

type ContainerHandle = {
  getId: () => string;
  getHost: () => string;
  getMappedPort: (port: number) => number;
  exec: (command: string[]) => Promise<{ output: string; stdout: string; stderr: string; exitCode: number }>;
  restart: () => Promise<void>;
};

const contextFile = path.join(projectRoot, 'tmp-integration-context.json');

async function cleanupSantokitContainers() {
  try {
    const client = await getContainerRuntimeClient();
    const containers = await client.container.list();
    const targets = containers.filter((container) => container.Labels?.['com.docker.compose.project'] === 'santokit-it');
    for (const target of targets) {
      try {
        const container = client.container.getById(target.Id);
        await client.container.stop(container, { timeout: 5 });
      } catch {
        // ignore
      }
      try {
        const container = client.container.getById(target.Id);
        await container.remove({ force: true, v: true });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

async function getServiceContainer(environment: Awaited<ReturnType<DockerComposeEnvironment['up']>>, service: string): Promise<ContainerHandle> {
  const patterns = [service, `${service}-1`, `${service}_1`];
  for (const pattern of patterns) {
    try {
      return environment.getContainer(pattern) as unknown as ContainerHandle;
    } catch {
      // ignore
    }
  }

  const client = await getContainerRuntimeClient();
  const containers = await client.container.list();
  const match =
    containers.find((container) =>
      container.Labels?.['com.docker.compose.project'] === 'santokit-it' &&
      container.Labels?.['com.docker.compose.service'] === service
    ) ??
    containers.find((container) =>
      container.Labels?.['com.docker.compose.service'] === service
    ) ??
    containers.find((container) =>
      service === 'hub' && typeof container.Image === 'string' && container.Image.includes('santokit-hub-test')
    ) ??
    containers.find((container) =>
      service === 'bridge' && typeof container.Image === 'string' && container.Image.includes('santokit-server-test')
    ) ??
    containers.find((container) =>
      container.Names?.some((name) => name.includes('santokit-it') && name.includes(service))
    ) ??
    containers.find((container) =>
      container.Names?.some((name) => name.includes(service))
    );

  if (!match) {
    const dockerode = (client.container as any).dockerode;
    const allContainers = dockerode ? await dockerode.listContainers({ all: true }) : [];
    const allMatch =
      allContainers.find((container: any) =>
        container.Labels?.['com.docker.compose.project'] === 'santokit-it' &&
        container.Labels?.['com.docker.compose.service'] === service
      ) ??
      allContainers.find((container: any) =>
        container.Labels?.['com.docker.compose.service'] === service
      ) ??
      allContainers.find((container: any) =>
        service === 'hub' && typeof container.Image === 'string' && container.Image.includes('santokit-hub-test')
      ) ??
      allContainers.find((container: any) =>
        service === 'bridge' && typeof container.Image === 'string' && container.Image.includes('santokit-server-test')
      ) ??
      allContainers.find((container: any) =>
        container.Names?.some((name: string) => name.includes('santokit-it') && name.includes(service))
      ) ??
      allContainers.find((container: any) =>
        container.Names?.some((name: string) => name.includes(service))
      );

    if (allMatch && dockerode) {
      const container = dockerode.getContainer(allMatch.Id);
      try {
        await client.container.start(container);
      } catch {
        // ignore
      }
      const inspect = await client.container.inspect(container);
      if (!inspect.State?.Running) {
        const logStream = await client.container.logs(container, { tail: 200 });
        const logs = await new Promise<string>((resolve) => {
          let data = '';
          logStream.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          logStream.on('end', () => resolve(data));
          logStream.on('error', () => resolve(''));
        });
        throw new Error(`Container "${service}" exists but is not running (state=${inspect.State?.Status}). Logs:\n${logs}`);
      }
    }

    throw new Error(`Could not find container for service "${service}".`);
  }

  const container = client.container.getById(match.Id);
  let inspect = await client.container.inspect(container);
  const host = client.info.containerRuntime.host;

  const getMappedPort = (port: number) => {
    const binding = inspect.NetworkSettings?.Ports?.[`${port}/tcp`]?.[0];
    const mappedPort = binding?.HostPort;
    if (!mappedPort) {
      throw new Error(`Could not get mapped port ${port} for ${service}`);
    }
    return Number(mappedPort);
  };

  return {
    getId: () => container.id,
    getHost: () => host,
    getMappedPort,
    exec: (command: string[]) => client.container.exec(container, command),
    restart: async () => {
      await client.container.restart(container);
      inspect = await client.container.inspect(container);
    }
  };
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

function normalizeExecOutput(output: { output?: string; stdout?: string; stderr?: string }) {
  return (output.stdout || output.stderr || output.output || '').trim();
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

async function execInContainer(container: any, command: string) {
  const result = await container.exec(['bash', '-lc', command]);
  if (result.exitCode !== 0) {
    throw new Error(normalizeExecOutput(result));
  }
  return result;
}

async function execInContainerAllowFailure(container: any, command: string) {
  return container.exec(['bash', '-lc', command]);
}

async function resetState(containerIds: { redis: any; postgres: any; hub: any; bridge: any }) {
  await containerIds.redis.exec(['redis-cli', 'FLUSHALL']);
  await containerIds.postgres.exec([
    'psql',
    '-U',
    'postgres',
    '-d',
    'santokit',
    '-c',
    'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  ]);
  await containerIds.hub.restart();
  await containerIds.bridge.restart();
}

async function waitForRedis(containerId: any, attempts = 30, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const output = await containerId.exec(['redis-cli', 'PING']);
      if ((output.output || '').trim() === 'PONG') return;
    } catch {
      // ignore and retry
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  throw new Error('Redis not ready');
}

async function waitForPostgres(containerId: any, attempts = 30, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await containerId.exec(['pg_isready', '-U', 'postgres']);
      if (result.exitCode === 0) return;
    } catch {
      // ignore and retry
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
  throw new Error('Postgres not ready');
}

async function startFlowContext(): Promise<{ ctx: FlowContext; cleanup: () => Promise<void> }> {
  // Use a temporary directory outside the workspace
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'santokit-integration-'));
  const projectDirContainer = '/workspace/tmp-integration-project';

  await cleanupSantokitContainers();

  // Cleaning up the local temp dir is handled by logic below/cleanup, 
  // but we also need to clean the CONTAINER volume since it persists given we use a named volume now.
  // We will do that after containers are up.

  let environment = new DockerComposeEnvironment(composeFilePath, composeFile)
    .withBuild()
    .withProjectName('santokit-it');
  environment = withServiceWaitStrategy(environment, services.hub, Wait.forHttp('/health', 8080));
  environment = withServiceWaitStrategy(environment, services.bridge, Wait.forHttp('/health', 3000));
  const startedEnvironment = await environment.up();

  const redisContainer = await getServiceContainer(startedEnvironment, services.redis);
  const postgresContainer = await getServiceContainer(startedEnvironment, services.postgres);
  let hubContainer: ContainerHandle;
  try {
    hubContainer = await getServiceContainer(startedEnvironment, services.hub);
  } catch {
    const hubImage = await GenericContainer
      .fromDockerfile(projectRoot, 'packages/integration-tests/test/integration/Dockerfile.hub')
      .build('santokit-hub-test:latest');
    hubContainer = await hubImage
      .withEnvironment({
        STK_HUB_ADDR: ':8080',
        STK_DISABLE_AUTH: 'true',
        STK_KV_REDIS: 'redis://redis:6379',
        STK_DATABASE_URL: 'postgres://postgres:password@postgres:5432/santokit?sslmode=disable',
        STK_ENCRYPTION_KEY: '32-byte-key-for-aes-256-gcm!!!!!'
      })
      .withNetworkMode('santokit-it')
      .withNetworkAliases('hub')
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp('/health', 8080))
      .start() as unknown as ContainerHandle;
  }
  const bridgeContainer = await getServiceContainer(startedEnvironment, services.bridge);
  const cliContainer = await getServiceContainer(startedEnvironment, services.cli);
  const clientContainer = await getServiceContainer(startedEnvironment, services.client);
  const userContainer = await getServiceContainer(startedEnvironment, services.user);

  const containerIds = {
    redis: redisContainer,
    postgres: postgresContainer,
    hub: hubContainer,
    bridge: bridgeContainer,
    cli: cliContainer,
    client: clientContainer,
    user: userContainer
  };

  await waitForRedis(containerIds.redis);
  await waitForPostgres(containerIds.postgres);

  // Clean up the shared volume in the container to ensure a fresh start
  // We use bash -c to rely on shell expansion for * to delete contents, avoiding "Device or resource busy" on the mount point
  await execInContainerAllowFailure(containerIds.cli, 'rm -rf /workspace/tmp-integration-project/* /workspace/tmp-integration-project/.[!.]*');
  // No need to mkdir because the mount point exists

  await resetState(containerIds);

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
    await execInContainer(containerIds.cli, `export PATH=\"/usr/local/go/bin:$PATH\"; cd ${cwd} && ${command}`);
  }

  async function execInClient(command: string) {
    const result = await execInContainerAllowFailure(containerIds.client, command);
    return { exitCode: result.exitCode ?? 1, output: result.output ?? '' };
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

    fs.writeFileSync(path.join(logicDir, 'storage', 'delete.js'), `---\naccess: public\n---\n\nexport default async function (_params, context) {\n  await context.storage.delete('test', 'file.txt');\n  return { deleted: true };\n}\n`);
  }

  async function ensureProjectPrepared() {
    if (projectPrepared) return;
    // Build the CLI to ensure we test the latest code
    // usage of go build is preferred over go install to control output location if needed, 
    // but go install puts it in $GOPATH/bin which is in PATH usually.
    await runCli('cd /workspace/packages/cli && go build -o /usr/local/bin/stk ./cmd/stk', '/workspace');

    await runCli(`stk init ${projectDirContainer}`, '/workspace');
    writeProjectFiles();
    // Copy the locally generated files into the container volume
    // Since writeProjectFiles creates the structure in the temp dir, we copy the contents
    await copyDirectoryToContainer(containerIds.cli.getId(), projectDir, projectDirContainer);

    // Also copy the scripts directory
    const localScriptsDir = path.resolve(__dirname, '../scripts');
    await copyDirectoryToContainer(containerIds.cli.getId(), localScriptsDir, `${projectDirContainer}/scripts`);

    projectPrepared = true;
  }

  async function ensureLogicApplied() {
    if (logicApplied) return;
    await ensureProjectPrepared();
    await runCli('stk logic apply', projectDirContainer);
    logicApplied = true;
  }

  const ctx: FlowContext = {
    hubUrl,
    apiUrl,
    apiUrlInternal: 'http://bridge:3000',
    projectDir,
    projectDirContainer,
    scriptsRootContainer,
    cliContainerId: containerIds.cli.getId(),
    clientContainerId: containerIds.client.getId(),
    postgresContainerId: containerIds.postgres.getId(),
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
    clientContainerId: ctx.clientContainerId,
    postgresContainerId: ctx.postgresContainerId
  };
  fs.writeFileSync(contextFile, JSON.stringify(serialized, null, 2));
  return async () => {
    // Intentionally no-op to reuse containers across runs.
  };
}
