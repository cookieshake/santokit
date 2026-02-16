---
auth: authenticated
params:
  name:
    type: string
    required: true
  owner_id:
    type: string
    required: true
---
INSERT INTO "items" ("name", "owner_id") VALUES (:name, :owner_id)
