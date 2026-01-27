# 06. Client SDK Specification

## Role
The "Interface". Provides a typed, function-like experience for backend APIs.

## Philosophy
**"No Code Generation (in source tree)."**
We do not clutter the user's `src/` folder with `api.ts` or models. We inject types directly into the library package.

## Components

### 1. The Proxy (`@santoki/client`)
At runtime, the client is a lightweight Proxy wrapper.

```javascript
import { stk } from '@santoki/client';

// The user calls this:
const user = await stk.logic.users.get({ id: 123 });

// The Proxy translates it to:
// POST https://device-edge.santoki.run/call
// Body: { path: "users/get", params: { id: 123 } }
```

### 2. Virtual Type Injection
*   **Trigger**: `stk sync`.
*   **Mechanism**:
    1.  Downloads `manifest.json` from Hub (contains inputs, outputs, description for all logic).
    2.  Generates a TypeScript Declaration file (`index.d.ts`).
    3.  Writes to `node_modules/@santoki/client/dist/index.d.ts`.
*   **Result**: Zero config IntelliSense.

## SDK Namespaces

### `stk.auth`
*   `login(provider)`: Initiates OAuth flow.
*   `logout()`: Clears tokens.
*   `me()`: Returns current session info.
*   `getToken()`: Internal use for attaching headers.

### `stk.files`
*   `upload(file, bucketAlias)`: Uploads to signed URL provided by Server.
*   `getPublicUrl(path)`: generating CDN URLs.

### `stk.logic`
*   Dynamic namespace matching the `logic/` folder structure.
*   Fully typed inputs and outputs based on the YAML definitions / SQL analysis.

## SSR/Edge Compatibility
*   The SDK must be isomorphic (work in Node.js and Browser).
*   For Next.js App Router (Server Components), it handles fetch headers correctly to propagate auth context.
