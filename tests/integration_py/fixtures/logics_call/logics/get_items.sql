---
auth: authenticated
params:
  owner_id:
    type: string
    required: true
---
SELECT * FROM "items" WHERE "owner_id" = :owner_id
