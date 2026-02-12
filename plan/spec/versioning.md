# Versioning & Compatibility

This document defines the versioning strategy for Santokit components (CLI, Hub, Bridge) and compatibility guarantees between versions.

---

## 1. Versioning Policy

### 1.1 Semantic Versioning

All Santokit components follow **Semantic Versioning 2.0** (semver.org):

```
MAJOR.MINOR.PATCH  (e.g., 2.1.3)

MAJOR: Incompatible API changes
MINOR: Backwards-compatible functionality additions
PATCH: Backwards-compatible bug fixes
```

**Examples:**
- `2.0.0` → `2.1.0`: Added new feature (backwards-compatible)
- `2.1.0` → `2.1.1`: Fixed bug (no breaking changes)
- `2.1.1` → `3.0.0`: Breaking change (incompatible with v2)

### 1.2 Pre-Release Versions

**Alpha:** Early development, unstable
```
2.1.0-alpha.1, 2.1.0-alpha.2, ...
```

**Beta:** Feature-complete, testing in progress
```
2.1.0-beta.1, 2.1.0-beta.2, ...
```

**Release Candidate:** Production-ready, final testing
```
2.1.0-rc.1, 2.1.0-rc.2, ...
```

**Stable:** Production release
```
2.1.0
```

---

## 2. Component Versions

### 2.1 CLI (`stk`)

**Current Version:** `2.0.0`

**Release Channels:**
- **Stable:** Recommended for production (`stk@latest`)
- **Beta:** Preview of next release (`stk@beta`)
- **Alpha:** Experimental features (`stk@alpha`)

**Installation:**
```bash
# Stable (recommended)
npm install -g @santokit/cli

# Beta
npm install -g @santokit/cli@beta

# Specific version
npm install -g @santokit/cli@2.1.0
```

**Version Check:**
```bash
stk version
# Output: stk version 2.1.0
```

---

### 2.2 Hub

**Current Version:** `2.0.0`

**Deployment:**
- Docker image: `santokit/hub:2.0.0`
- Kubernetes: `kubectl set image deployment/hub hub=santokit/hub:2.0.0`

**Version Discovery:**
```bash
# Via CLI
stk hub version

# Via API
curl https://hub.example.com/version
# Output: {"version": "2.0.0", "build": "abc123", "commitSha": "def456"}
```

---

### 2.3 Bridge

**Current Version:** `2.0.0`

**Deployment:**
- Docker image: `santokit/bridge:2.0.0`
- Kubernetes: `kubectl set image deployment/bridge bridge=santokit/bridge:2.0.0`

**Version Discovery:**
```bash
# Via CLI
stk bridge version --env prod

# Via API
curl https://bridge.example.com/version
# Output: {"version": "2.0.0", "releaseId": "rel_abc123", "lastSync": "2026-02-10T14:00:00Z"}
```

---

## 3. Compatibility Matrix

### 3.1 CLI ↔ Hub

| CLI Version | Hub 1.x | Hub 2.0 | Hub 2.1 | Hub 3.0 |
|-------------|---------|---------|---------|---------|
| **1.x** | ✅ Full | ⚠️ Limited | ❌ No | ❌ No |
| **2.0** | ⚠️ Limited | ✅ Full | ✅ Full | ❌ No |
| **2.1** | ❌ No | ✅ Full | ✅ Full | ✅ Full |
| **3.0** | ❌ No | ⚠️ Limited | ✅ Full | ✅ Full |

**Legend:**
- ✅ **Full:** All features supported
- ⚠️ **Limited:** Core features work, some new features unavailable
- ❌ **No:** Incompatible, error on connection

**Compatibility Rules:**
- CLI can talk to Hub with same MAJOR version (e.g., CLI 2.x ↔ Hub 2.x)
- CLI MINOR version ≤ Hub MINOR version (e.g., CLI 2.1 cannot use Hub 2.0 features)
- MAJOR version mismatch: Error with upgrade prompt

**Error Message:**
```bash
stk projects list

Error: CLI version 3.0 incompatible with Hub 2.1
Upgrade Hub to 3.x or downgrade CLI to 2.x
```

---

### 3.2 Hub ↔ Bridge

| Hub Version | Bridge 1.x | Bridge 2.0 | Bridge 2.1 | Bridge 3.0 |
|-------------|-----------|-----------|-----------|-----------|
| **1.x** | ✅ Full | ❌ No | ❌ No | ❌ No |
| **2.0** | ❌ No | ✅ Full | ✅ Full | ❌ No |
| **2.1** | ❌ No | ✅ Full | ✅ Full | ✅ Full |
| **3.0** | ❌ No | ❌ No | ✅ Full | ✅ Full |

**Compatibility Rules:**
- **Hub MAJOR = Bridge MAJOR** (strict requirement)
- **Hub MINOR ≥ Bridge MINOR** (Hub can be newer, not older)
- Release payload versioned: `{"version": "2.1", "schema": {...}}`

**Version Check:**
```bash
# Hub checks Bridge version on polling
GET /internal/releases/current
Headers:
  X-Bridge-Version: 2.0.3
  X-Bridge-Instance-Id: bridge-prod-us-east-1a

# Hub response includes minimum required Bridge version
{
  "releaseId": "rel_abc123",
  "minimumBridgeVersion": "2.0.0",
  "schema": {...}
}
```

**Upgrade Workflow:**
1. Upgrade Hub first (e.g., 2.0 → 2.1)
2. Hub continues serving Bridge 2.0 instances
3. Upgrade Bridge instances (rolling update)
4. After all Bridge instances on 2.1, Hub can use 2.1 features

---

### 3.3 Bridge ↔ Client SDK

| Bridge Version | SDK 1.x (JS) | SDK 2.0 (JS) | SDK 2.1 (JS) |
|----------------|-------------|-------------|-------------|
| **1.x** | ✅ Full | ❌ No | ❌ No |
| **2.0** | ⚠️ Limited | ✅ Full | ✅ Full |
| **2.1** | ❌ No | ✅ Full | ✅ Full |

**Compatibility Rules:**
- SDK MAJOR version should match Bridge MAJOR version
- SDK can be older MINOR version (backwards-compatible)
- Bridge API versioned: `/v2/db/users/select`

**API Version Negotiation:**
```javascript
// Client SDK specifies API version
import { SantokitClient } from '@santokit/client';

const client = new SantokitClient({
  apiUrl: 'https://bridge.example.com',
  apiVersion: '2.1',  // Defaults to SDK version
  apiKey: 'stk_live_...',
});
```

**Bridge Response (if version mismatch):**
```json
{
  "error": "API_VERSION_UNSUPPORTED",
  "message": "API version 3.0 not supported by this Bridge (supports 2.x)",
  "supportedVersions": ["2.0", "2.1"]
}
```

---

## 4. Deprecation Policy

### 4.1 Deprecation Timeline

| Component | Deprecation Period | End-of-Life (EOL) |
|-----------|-------------------|-------------------|
| CLI (MAJOR version) | 12 months | 18 months |
| Hub (MAJOR version) | 12 months | 18 months |
| Bridge (MAJOR version) | 6 months | 12 months |
| API endpoint | 6 months | 12 months |
| Schema feature | 3 months | 6 months |

**Example:**
- Bridge 1.x deprecated: 2026-01-01
- Bridge 1.x EOL: 2026-07-01 (6 months later)

### 4.2 Deprecation Announcement

**Channels:**
- Release notes: https://github.com/santokit/releases
- Email: deprecation-notices@santokit.com
- In-app warnings: CLI, Hub UI, Bridge logs

**Warning Example (CLI):**
```bash
stk apply --env prod

⚠️  WARNING: CLI 1.9 is deprecated and will reach EOL on 2026-07-01
Please upgrade to CLI 2.x: npm install -g @santokit/cli@latest

✅ Schema applied successfully (release: rel_abc123)
```

**Warning Example (Bridge logs):**
```
[WARN] Bridge 1.9 is deprecated (EOL: 2026-07-01). Upgrade to 2.x recommended.
[INFO] Release fetched successfully (rel_abc123)
```

### 4.3 Breaking Change Communication

**For MAJOR version bumps:**
1. **Migration guide** published 3 months before release
2. **Breaking changes documented** in release notes
3. **Upgrade assistant** (CLI command to check compatibility)

**Example:**
```bash
# Check if current project compatible with v3
stk upgrade-check --target-version 3.0

# Output:
❌ Incompatible: Custom Logic syntax changed (see migration guide)
❌ Incompatible: Permissions YAML schema updated
✅ Compatible: Schema YAML (no changes)

Migration guide: https://docs.santokit.com/migrate-v2-to-v3
```

---

## 5. Upgrade Strategies

### 5.1 Rolling Upgrade (Zero Downtime)

**For MINOR version bumps (e.g., 2.0 → 2.1):**

```bash
# Step 1: Upgrade Hub (backwards-compatible with Bridge 2.0)
kubectl set image deployment/hub hub=santokit/hub:2.1.0
kubectl rollout status deployment/hub

# Step 2: Upgrade Bridge (rolling update, 25% at a time)
kubectl set image deployment/bridge bridge=santokit/bridge:2.1.0
kubectl rollout status deployment/bridge

# Step 3: Upgrade CLI (operators)
npm install -g @santokit/cli@2.1.0
```

**Rollback (if issues):**
```bash
kubectl rollout undo deployment/hub
kubectl rollout undo deployment/bridge
```

---

### 5.2 Blue-Green Deployment (MAJOR Version)

**For MAJOR version bumps (e.g., 2.x → 3.0):**

```bash
# Step 1: Deploy v3 in parallel (blue = v2, green = v3)
kubectl apply -f k8s/hub-v3-deployment.yaml
kubectl apply -f k8s/bridge-v3-deployment.yaml

# Step 2: Test green environment
stk --hub-url https://hub-v3.example.com projects list

# Step 3: Switch DNS (Route 53 weighted routing: 10% to v3)
aws route53 change-resource-record-sets ...

# Step 4: Monitor for 24 hours (metrics, errors, logs)

# Step 5: Gradually increase traffic (10% → 50% → 100%)

# Step 6: Decommission blue environment (after 7 days)
kubectl delete deployment hub-v2 bridge-v2
```

**Rollback:** Switch DNS back to v2 (instant rollback)

---

## 6. Long-Term Support (LTS)

### 6.1 LTS Versions

**Every 2nd MAJOR version is LTS:**
- **LTS:** 2.x, 4.x, 6.x (extended support)
- **Non-LTS:** 1.x, 3.x, 5.x (standard support)

**Support Duration:**
- **LTS:** 24 months (12 months active, 12 months maintenance)
- **Non-LTS:** 12 months (6 months active, 6 months maintenance)

**Example:**
- Bridge 2.0 released: 2026-01-01 (LTS)
- Active support: 2026-01-01 to 2027-01-01 (new features, bug fixes)
- Maintenance: 2027-01-01 to 2028-01-01 (critical bug fixes only)
- EOL: 2028-01-01

### 6.2 Backporting Policy

**LTS versions receive:**
- ✅ Security patches (critical vulnerabilities)
- ✅ Critical bug fixes (data loss, crashes)
- ❌ New features (upgrade to latest for features)

**Non-LTS versions receive:**
- ✅ Security patches (until EOL)
- ⚠️ Bug fixes (at discretion, upgrade recommended)

---

## 7. Version Discovery & Tracking

### 7.1 CLI Commands

```bash
# Show versions of all components
stk version --all

# Output:
CLI: 2.1.0
Hub: 2.1.3 (project: my-project)
Bridge: 2.1.2 (env: prod)
SDK (TypeScript): 2.1.1

# Check for updates
stk version --check-updates

# Output:
✅ CLI is up to date (2.1.0)
⚠️  Hub update available (2.1.3 → 2.2.0)
✅ Bridge is up to date (2.1.2)
```

---

### 7.2 Hub Tracking

**Hub tracks component versions:**
```sql
-- Hub DB table
CREATE TABLE bridge_heartbeats (
  instance_id TEXT PRIMARY KEY,
  project_id UUID,
  env_name TEXT,
  version TEXT,  -- e.g., "2.1.2"
  last_seen TIMESTAMPTZ DEFAULT NOW()
);
```

**Query active versions:**
```bash
stk bridge versions --project my-project --env prod

# Output:
Instance: bridge-prod-us-east-1a, Version: 2.1.2, Last Seen: 30s ago
Instance: bridge-prod-us-east-1b, Version: 2.1.2, Last Seen: 45s ago
Instance: bridge-prod-us-west-1a, Version: 2.0.8, Last Seen: 2m ago ⚠️  (upgrade recommended)
```

---

## 8. Release Cadence

### 8.1 Schedule

| Version Type | Cadence | Example Release Date |
|-------------|---------|---------------------|
| MAJOR | Yearly | January (e.g., 3.0.0 on 2027-01-15) |
| MINOR | Quarterly | April, July, Oct (e.g., 2.1.0, 2.2.0, 2.3.0) |
| PATCH | As needed | Bug fixes, security patches (e.g., 2.1.1, 2.1.2) |

### 8.2 Release Process

**1. Development (6 weeks):**
- Feature branches merged to `main`
- Nightly builds: `2.2.0-alpha.1`, `2.2.0-alpha.2`, ...

**2. Beta Testing (2 weeks):**
- Feature freeze, beta release: `2.2.0-beta.1`
- Internal testing, select customers opt-in

**3. Release Candidate (1 week):**
- Code freeze, release candidate: `2.2.0-rc.1`
- Final testing, documentation

**4. Stable Release:**
- Tag: `v2.2.0`
- Docker images: `santokit/hub:2.2.0`, `santokit/bridge:2.2.0`
- NPM publish: `@santokit/cli@2.2.0`
- Announcement: Blog post, release notes

---

## 9. Related Documents

- **`plan/spec/schema-evolution.md`** — Schema versioning and migrations
- **`plan/spec/bridge-hub-protocol.md`** — Release payload versioning
- **`plan/flows/disaster-recovery.md`** — Upgrade rollback procedures
- **`plan/flows/operator.md`** — Operator upgrade workflows

---

## Summary

**Versioning Principles:**
1. **Semver everywhere** — Predictable, industry-standard
2. **Backwards compatibility** — MINOR versions don't break existing functionality
3. **Explicit deprecation** — 6-12 month notice before removal
4. **Zero-downtime upgrades** — Rolling updates for MINOR, blue-green for MAJOR
5. **LTS for stability** — 24-month support for even MAJOR versions

**Golden Rule:** Upgrade early, upgrade often. Staying current reduces upgrade pain and ensures security patches.
