---
auth: authenticated
params:
  owner_id:
    type: string
    required: true
  name:
    type: string
    required: true
condition: request.params.owner_id == request.auth.sub
---
INSERT INTO items(name, owner_id) VALUES (:name, :owner_id)
