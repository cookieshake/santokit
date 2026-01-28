# Sample Santoki Project

This is a sample Santoki project demonstrating the standard directory structure.

## Structure

```
sample-project/
├── base/           # Infrastructure definitions
│   ├── main.hcl    # Main database schema
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

1. Install the Santoki CLI:
   ```bash
   go install github.com/cookieshake/santoki/packages/cli/cmd/stk@latest
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
   stk base push
   stk logic push
   ```
