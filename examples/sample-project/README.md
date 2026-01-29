# Sample Santokit Project

This is a sample Santokit project demonstrating the standard directory structure.

## Structure

```
sample-project/
├── base/           # Schema definitions
│   └── main.hcl    # Main database schema
├── config/         # Project config
│   ├── databases.yaml # Database connections
│   ├── auth.yaml   # Authentication configuration
│   └── storage.yaml # Storage buckets configuration
└── logic/          # Business logic
    ├── users/      # Users namespace
    │   ├── get.sql
    │   └── update.js
    └── orders/     # Orders namespace
        └── create.sql
```

## Getting Started

1. Install the Santokit CLI:
   ```bash
   go install github.com/cookieshake/santokit/packages/cli/cmd/stk@latest
   ```

2. Initialize your project:
   ```bash
   stk init my-project
   ```

3. Start development server:
   ```bash
   stk dev
   ```

4. Deploy to production:
   ```bash
   stk schema plan
   stk config apply
   stk logic apply
   ```
