import { GenericContainer, Wait, Network, type StartedNetwork } from 'testcontainers';
import { beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const projectRoot = path.resolve(__dirname, '../../../../../');
const integrationRoot = path.join(projectRoot, 'packages/integration-tests/test/integration');
const scriptsRootContainer = '/workspace/packages/integration-tests/test/integration/scripts';

type StartedContainer = Awaited<ReturnType<typeof GenericContainer.prototype.start>>;

type FlowContext = {
  hubUrl: string;
  apiUrl: string;
  projectDir: string;
  projectDirContainer: string;
  scriptsRootContainer: string;
  runCli: (command: string, cwd?: string) => Promise<void>;
  execInClient: (command: string) => Promise<{ exitCode: number; output: string }>;
  ensureProjectPrepared: () => Promise<void>;
  ensureLogicApplied: () => Promise<void>;
};

let contextPromise: Promise<FlowContext> | null = null;
let refCount = 0;
let stopContext: (() => Promise<void>) | null = null;

async function startContext(): Promise<FlowContext> {
  let network: StartedNetwork;
  let redisContainer: StartedContainer;
  let postgresContainer: StartedContainer;
  let hubContainer: StartedContainer;
  let serverContainer: StartedContainer;
  let cliContainer: StartedContainer;
  let clientContainer: StartedContainer;
  let userContainer: StartedContainer;

  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'santokit-home-'));
  const projectDir = path.join(projectRoot, 'tmp-integration-project');
  const projectDirContainer = '/workspace/tmp-integration-project';

  if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });

  network = await new Network().start();

  redisContainer = await new GenericContainer('redis:7-alpine')
    .withNetwork(network)
    .withNetworkAliases('redis')
    .withExposedPorts(6379)
    .start();

  postgresContainer = await new GenericContainer('postgres:15-alpine')
    .withNetwork(network)
    .withNetworkAliases('postgres')
    .withEnvironment({
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'password',
      POSTGRES_DB: 'santokit'
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
    .start();

  const hubImage = await GenericContainer.fromDockerfile(
    projectRoot,
    'packages/integration-tests/test/integration/Dockerfile.hub'
  )
    .build('santokit-hub-test', { deleteOnExit: true });

  hubContainer = await hubImage
    .withNetwork(network)
    .withNetworkAliases('hub')
    .withEnvironment({
      STK_HUB_ADDR: ':8080',
      STK_DISABLE_AUTH: 'true',
      STK_KV_REDIS: 'redis://redis:6379',
      STK_DATABASE_URL: 'postgres://postgres:password@postgres:5432/santokit?sslmode=disable'
    })
    .withExposedPorts(8080)
    .withWaitStrategy(Wait.forHttp('/health', 8080))
    .start();

  const hubUrl = `http://${hubContainer.getHost()}:${hubContainer.getMappedPort(8080)}`;

  const serverImage = await GenericContainer.fromDockerfile(
    projectRoot,
    'packages/integration-tests/test/integration/Dockerfile.server'
  )
    .build('santokit-server-test', { deleteOnExit: true });

  serverContainer = await serverImage
    .withNetwork(network)
    .withNetworkAliases('bridge')
    .withEnvironment({
      REDIS_URL: 'redis://redis:6379',
      DATABASE_URL: 'postgres://postgres:password@postgres:5432/santokit?sslmode=disable',
      STK_ENCRYPTION_KEY: '32-byte-key-for-aes-256-gcm!!!!!',
      STORAGE_ENDPOINT: 'http://user:8081',
      STORAGE_ACCESS_KEY_ID: 'test-access',
      STORAGE_SECRET_ACCESS_KEY: 'test-secret',
      STORAGE_REGION: 'auto'
    })
    .withExposedPorts(3000)
    .withWaitStrategy(Wait.forLogMessage(/Santokit Test Server running/))
    .start();

  const apiUrl = `http://${serverContainer.getHost()}:${serverContainer.getMappedPort(3000)}`;

  const cliImage = await GenericContainer.fromDockerfile(
    projectRoot,
    'packages/integration-tests/test/integration/Dockerfile.cli'
  )
    .build('santokit-cli-test', { deleteOnExit: true });

  cliContainer = await cliImage
    .withNetwork(network)
    .withNetworkAliases('cli')
    .withBindMounts([
      { source: projectRoot, target: '/workspace' },
      { source: homeDir, target: '/data/home' }
    ])
    .withEnvironment({ HOME: '/data/home' })
    .withCmd(['sleep', 'infinity'])
    .start();

  const nodeImage = await GenericContainer.fromDockerfile(
    projectRoot,
    'packages/integration-tests/test/integration/Dockerfile.node'
  )
    .build('santokit-node-test', { deleteOnExit: true });

  userContainer = await nodeImage
    .withNetwork(network)
    .withNetworkAliases('user')
    .withBindMounts([{ source: projectRoot, target: '/workspace' }])
    .withCmd(['node', '/workspace/packages/integration-tests/test/integration/scripts/user-server.js'])
    .withExposedPorts(8081)
    .withWaitStrategy(Wait.forLogMessage(/User dev server listening/))
    .start();

  clientContainer = await nodeImage
    .withNetwork(network)
    .withNetworkAliases('client')
    .withBindMounts([{ source: projectRoot, target: '/workspace' }])
    .withCmd(['sleep', 'infinity'])
    .start();

  async function runCli(command: string, cwd = projectDirContainer) {
    const result = await cliContainer.exec([
      'bash',
      '-lc',
      `cd ${cwd} && ${command}`
    ], {
      env: {
        STK_HUB_URL: 'http://hub:8080',
        STK_PROJECT_ID: 'default',
        STK_TOKEN: 'test-token',
        STK_DISABLE_AUTH: 'true',
        PATH: process.env.PATH
      }
    });

    if (result.exitCode !== 0) {
      throw new Error(result.output);
    }
  }

  async function execInClient(command: string) {
    return clientContainer.exec(['bash', '-lc', command]);
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

  stopContext = async () => {
    if (clientContainer) await clientContainer.stop();
    if (userContainer) await userContainer.stop();
    if (cliContainer) await cliContainer.stop();
    if (serverContainer) await serverContainer.stop();
    if (hubContainer) await hubContainer.stop();
    if (postgresContainer) await postgresContainer.stop();
    if (redisContainer) await redisContainer.stop();
    if (network) await network.stop();

    if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
  };

  return {
    hubUrl,
    apiUrl,
    projectDir,
    projectDirContainer,
    scriptsRootContainer,
    runCli,
    execInClient,
    ensureProjectPrepared,
    ensureLogicApplied
  };
}

export function setupSuite() {
  let context: FlowContext;

  beforeAll(async () => {
    refCount += 1;
    if (!contextPromise) {
      contextPromise = startContext();
    }
    context = await contextPromise;
  }, 600000);

  afterAll(async () => {
    refCount -= 1;
    if (refCount === 0 && stopContext) {
      await stopContext();
      stopContext = null;
      contextPromise = null;
    }
  }, 600000);

  return () => context;
}
