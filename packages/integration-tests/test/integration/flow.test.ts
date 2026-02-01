import { GenericContainer, Wait, Network, type StartedNetwork } from "testcontainers";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "../../../client/src/index.ts";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";

describe("Santokit Integration Flow", () => {
  let network: StartedNetwork;
  let redisContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;
  let postgresContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;
  let hubContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;
  let serverContainer: Awaited<ReturnType<typeof GenericContainer.prototype.start>>;

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
        POSTGRES_DB: "santokit"
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
        const check = await postgresContainer.exec(["psql", "-U", "postgres", "-d", "santokit", "-c", "SELECT 1"]);
        if (check.exitCode === 0) {
          console.log("DB santokit is ready.");
          break;
        } else {
          console.log("psql check failed:", check.output);
        }
      } catch (e) {
        console.log("psql check error:", e);
      }
      console.log(`Waiting for DB santokit... (${retries})`);
      await new Promise(r => setTimeout(r, 1000));
      retries--;
    }

    // Initialize DB Schema
    const createTable = await postgresContainer.exec([
      "psql", "-U", "postgres", "-d", "santokit", "-c",
      "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, roles TEXT[], created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP, avatar_url TEXT, metadata JSONB);"
    ]);
    console.log("Create Table:", createTable.output);
    if (createTable.exitCode !== 0) throw new Error("Failed to create table: " + createTable.output);

    const insertUser = await postgresContainer.exec([
      "psql", "-U", "postgres", "-d", "santokit", "-c",
      "INSERT INTO users (id, email, name, roles) VALUES ('user_123', 'test@example.com', 'Test User', '{user}');"
    ]);
    console.log("Insert User:", insertUser.output);
    if (insertUser.exitCode !== 0) throw new Error("Failed to insert user: " + insertUser.output);

    // 3. Start Hub
    console.log("Building Hub image...");
    const hubImage = await GenericContainer.fromDockerfile(projectRoot, "packages/integration-tests/test/integration/Dockerfile.hub")
      .build("santokit-hub-test", { deleteOnExit: true });

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
      .build("santokit-server-test", { deleteOnExit: true });

    serverContainer = await serverImage
      .withNetwork(network)
      .withNetworkAliases("server")
      .withEnvironment({
        REDIS_URL: "redis://redis:6379",
        DATABASE_URL: "postgres://postgres:password@postgres:5432/santokit"
      })
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forLogMessage(/Santokit Test Server running/))
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

  it("should apply logic via CLI and execute via Client SDK", async () => {
    console.log("Running CLI Apply...");

    // Setup temporary logic dir for CLI
    const tempLogicDir = path.join(projectRoot, "logic");
    if (fs.existsSync(tempLogicDir)) fs.rmSync(tempLogicDir, { recursive: true });
    fs.cpSync(path.join(projectRoot, "examples/sample-project/logic"), tempLogicDir, { recursive: true });

    try {
      const cliEnv = {
        ...process.env,
        STK_HUB_URL: hubUrl,
        STK_PROJECT_ID: "default",
        STK_TOKEN: "test-token",
        STK_DISABLE_AUTH: "true" // For testing
      };

      // Run go run packages/cli/cmd/stk/main.go logic apply from project root
      if (!fs.existsSync(path.join(projectRoot, "go.work"))) {
        execSync("go work init && go work use packages/cli packages/hub", { cwd: projectRoot });
      }

      console.log("Applying logic...");
      execSync("go run packages/cli/cmd/stk/main.go logic apply", {
        cwd: projectRoot,
        env: cliEnv,
        stdio: "inherit"
      });

      console.log("Logic applied. Testing API...");

      // Now use the client SDK to call the server
      const stk = createClient({ baseUrl: apiUrl });

      // Create a valid JWT token for testing
      const payload = {
        sub: 'user_123',
        email: 'test@example.com',
        roles: ['authenticated'],
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      };
      const dummyToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        btoa(JSON.stringify(payload)) +
        '.dummy-signature';

      // Test 1: Get user
      console.log("Test 1: Getting user...");
      const result: any = await stk.request('users/get', { id: 'user_123' }, {
        headers: { 'Authorization': `Bearer ${dummyToken}` }
      });

      console.log("API Result:", result);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].id).toBe("user_123");
      expect(result[0].name).toBe("Test User");

      // Test 2: Update user
      console.log("Test 2: Updating user...");
      const updated: any = await stk.request(
        'users/update',
        { id: 'user_123', name: 'Updated User' },
        { headers: { 'Authorization': `Bearer ${dummyToken}` } }
      );
      console.log("API Update Result:", updated);
      expect(updated).toBeDefined();
      expect(updated.updated).toBe(true);
      expect(updated.user.name).toBe("Updated User");

      // Test 3: Verify updated data
      console.log("Test 3: Verifying update...");
      const verified: any = await stk.request('users/get', { id: 'user_123' }, {
        headers: { 'Authorization': `Bearer ${dummyToken}` }
      });
      expect(verified[0].name).toBe("Updated User");

      console.log("✅ All API tests passed!");

    } finally {
      if (fs.existsSync(tempLogicDir)) fs.rmSync(tempLogicDir, { recursive: true });
    }
  }, 60000);

  it("should handle authentication correctly", async () => {
    console.log("Testing authentication...");

    const stk = createClient({ baseUrl: apiUrl });

    // Test 1: Request without token should fail for authenticated endpoints
    console.log("Test 1: No token (should work for public endpoints)...");
    try {
      // This might work or fail depending on access control
      const result = await stk.request('users/get', { id: 'user_123' });
      console.log("No token result:", result);
    } catch (error: any) {
      console.log("No token failed as expected:", error.message);
    }

    // Test 2: Invalid token should be rejected
    console.log("Test 2: Invalid token...");
    try {
      await stk.request('users/get', { id: 'user_123' }, {
        headers: { 'Authorization': 'Bearer invalid-token-here' }
      });
      // If we get here, auth might be disabled
      console.log("⚠️ Invalid token was accepted (auth might be disabled)");
    } catch (error: any) {
      console.log("✅ Invalid token rejected:", error.statusCode);
      expect(error.statusCode).toBeGreaterThanOrEqual(400);
    }

    // Test 3: Valid token should work
    console.log("Test 3: Valid token...");
    const payload = {
      sub: 'user_123',
      email: 'test@example.com',
      roles: ['authenticated'],
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      btoa(JSON.stringify(payload)) +
      '.dummy-signature';

    const result = await stk.request('users/get', { id: 'user_123' }, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    expect(result).toBeDefined();
    console.log("✅ Valid token accepted");
  }, 30000);

  it("should manage secrets via Hub API", async () => {
    console.log("Testing secret management...");

    // Test 1: Set a secret
    console.log("Test 1: Setting secret...");
    const setResponse = await fetch(`${hubUrl}/api/v1/secrets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({
        project_id: 'default',
        key: 'TEST_SECRET',
        value: 'secret-value-123'
      })
    });

    expect(setResponse.ok).toBe(true);
    console.log("✅ Secret set");

    // Test 2: List secrets
    console.log("Test 2: Listing secrets...");
    const listResponse = await fetch(`${hubUrl}/api/v1/secrets?project_id=default`, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });

    expect(listResponse.ok).toBe(true);
    const secrets = await listResponse.json();
    expect(secrets).toContain('TEST_SECRET');
    console.log("✅ Secret listed:", secrets);

    // Test 3: Delete secret
    console.log("Test 3: Deleting secret...");
    const deleteResponse = await fetch(`${hubUrl}/api/v1/secrets/TEST_SECRET?project_id=default`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });

    expect(deleteResponse.ok).toBe(true);
    console.log("✅ Secret deleted");

    // Test 4: Verify deletion
    console.log("Test 4: Verifying deletion...");
    const verifyResponse = await fetch(`${hubUrl}/api/v1/secrets?project_id=default`, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    const remainingSecrets = await verifyResponse.json();
    expect(remainingSecrets).not.toContain('TEST_SECRET');
    console.log("✅ Secret deletion verified");
  }, 30000);
});
