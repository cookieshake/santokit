---
auth: authenticated
params:
  id:
    type: string
    required: true
  name:
    type: string
    required: true
  price:
    type: int
    required: true
  owner_id:
    type: string
    required: true
---
INSERT INTO "items" ("id", "name", "price", "owner_id") VALUES (:id, :name, :price, :owner_id)
