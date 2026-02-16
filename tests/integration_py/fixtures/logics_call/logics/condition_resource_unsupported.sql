---
auth: authenticated
params:
  owner_id:
    type: string
    required: true
condition: resource.owner_id == request.auth.sub
---
SELECT :owner_id as owner_id
