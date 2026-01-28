import { GenericContainer, Wait, Network, StartedNetwork, StartedGenericContainer } from "testcontainers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "../../../client/src/index.ts";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";

describe("Santoki Integration Flow", () => {
  let network: StartedNetwork;
  let redisContainer: StartedGenericContainer;
  let postgresContainer: StartedGenericContainer;
  let hubContainer: StartedGenericContainer;
  let serverContainer: StartedGenericContainer;
  
  let hubUrl: string;
  let apiUrl: string;
  
  const projectRoot = path.resolve(__dirname, "../../../../");

  beforeAll(async () => {
    // Create shared network
    network = await new Network().start();

    // 1. Start Redis
    console.log("Starting Redis...");
    redisContainer = await new GenericContainer("redis:7-alpine")
      .withNetwork(network)
      .withNetworkAliases("redis")
      .withExposedPorts(6379)
      .start();

    // 2. Start Postgres
    console.log("Starting Postgres...");
    postgresContainer = await new GenericContainer("postgres:15-alpine")
      .withNetwork(network)
      .withNetworkAliases("postgres")
      .withEnvironment({
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "password",
        POSTGRES_DB: "santoki"
      })
      .withExposedPorts(5432)
      // Wait for the SECOND ready message or just wait a bit safe margin
      // Better: exec pg_isready
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();

    // Retry loop for DB initialization
    let retries = 30;
    while (retries > 0) {
        try {
            // Use psql to actually check DB existence
            const check = await postgresContainer.exec(["psql", "-U", "postgres", "-d", "santoki", "-c", "SELECT 1"]);
            if (check.exitCode === 0) {
                console.log("DB santoki is ready.");
                break;
            } else {
                console.log("psql check failed:", check.output);
            }
        } catch (e) {
            console.log("psql check error:", e);
        }
        console.log(`Waiting for DB santoki... (${retries})`);
        await new Promise(r => setTimeout(r, 1000));
        retries--;
    }

    // Initialize DB Schema
    const createTable = await postgresContainer.exec([
        "psql", "-U", "postgres", "-d", "santoki", "-c", 
        "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, roles TEXT[], created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP, avatar_url TEXT, metadata JSONB);"
    ]);
    console.log("Create Table:", createTable.output);
    if (createTable.exitCode !== 0) throw new Error("Failed to create table: " + createTable.output);

    const insertUser = await postgresContainer.exec([
        "psql", "-U", "postgres", "-d", "santoki", "-c", 
        "INSERT INTO users (id, email, name, roles) VALUES ('user_123', 'test@example.com', 'Test User', '{user}');"
    ]);
    console.log("Insert User:", insertUser.output);
    if (insertUser.exitCode !== 0) throw new Error("Failed to insert user: " + insertUser.output);

    // 3. Start Hub
    console.log("Building Hub image...");
    const hubImage = await GenericContainer.fromDockerfile(projectRoot, "packages/integration-tests/test/integration/Dockerfile.hub")
      .build("santoki-hub-test", { deleteOnExit: true });

    hubContainer = await hubImage
      .withNetwork(network)
      .withNetworkAliases("hub")
      .withEnvironment({
          STK_KV_REDIS: "redis://redis:6379" // Configure Hub to push to Redis
      })
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/health", 8080))
      .start();
    
    (await hubContainer.logs()).pipe(process.stdout);

    hubUrl = `http://${hubContainer.getHost()}:${hubContainer.getMappedPort(8080)}`;
    console.log("Hub started at", hubUrl);

    // 4. Start Server
    console.log("Building Server image...");
    const serverImage = await GenericContainer.fromDockerfile(projectRoot, "packages/integration-tests/test/integration/Dockerfile.server")
      .build("santoki-server-test", { deleteOnExit: true });

    serverContainer = await serverImage
      .withNetwork(network)
      .withNetworkAliases("server")
      .withEnvironment({
          REDIS_URL: "redis://redis:6379",
          DATABASE_URL: "postgres://postgres:password@postgres:5432/santoki"
      })
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forLogMessage(/Santoki Test Server running/))
      .start();
    
    (await serverContainer.logs()).pipe(process.stdout);

    apiUrl = `http://${serverContainer.getHost()}:${serverContainer.getMappedPort(3000)}`;
    console.log("Server started at", apiUrl);
  }, 180000);

  afterAll(async () => {
    if (serverContainer) await serverContainer.stop();
    if (hubContainer) await hubContainer.stop();
    if (postgresContainer) await postgresContainer.stop();
    if (redisContainer) await redisContainer.stop();
    if (network) await network.stop();
  });

  it("should push logic via CLI and execute via Client SDK", async () => {
    console.log("Running CLI Push...");
    
    // Setup temporary logic dir for CLI
    const tempLogicDir = path.join(projectRoot, "logic");
    if (fs.existsSync(tempLogicDir)) fs.rmSync(tempLogicDir, { recursive: true });
    fs.cpSync(path.join(projectRoot, "examples/sample-project/logic"), tempLogicDir, { recursive: true });

    try {
      const cliEnv = {
        ...process.env,
        STK_HUB_URL: hubUrl, // CLI talks to Hub (exposed port)
        STK_PROJECT_ID: "default",
        STK_TOKEN: "test-token"
      };

      // Run go run packages/cli/cmd/stk/main.go logic push from project root
      // We must ensure go.work exists for go run to work from root
      if (!fs.existsSync(path.join(projectRoot, "go.work"))) {
          execSync("go work init && go work use packages/cli packages/hub", { cwd: projectRoot });
      }

      console.log("Pushing logic...");
      execSync("go run packages/cli/cmd/stk/main.go logic push", { 
          cwd: projectRoot,
          env: cliEnv,
          stdio: "inherit"
      });

      console.log("Logic pushed. Testing API...");

      // Now use the client SDK to call the server
      const stk = createClient({ baseUrl: apiUrl });
      const dummyToken = 'h.' + btoa(JSON.stringify({ sub: 'user_123', email: 'm@t.c', roles: ['authenticated'] })) + '.s';
      
      const result: any = await stk.request('users/get', { id: 'user_123' }, { 
          headers: { 'Authorization': `Bearer ${dummyToken}` } 
      });

      console.log("API Result:", result);
      expect(result).toBeDefined();
      expect(result[0].id).toBe("user_123");
      expect(result[0].name).toBe("Test User");

    } finally {
      if (fs.existsSync(tempLogicDir)) fs.rmSync(tempLogicDir, { recursive: true });
    }
  }, 60000);
});
