---
# Get User by ID
# Endpoint: GET /users/get
target: main
params:
  id:
    type: string
    required: true
access: authenticated
cache: 5m
---

SELECT 
  id,
  email,
  name,
  avatar_url,
  roles,
  metadata,
  created_at,
  updated_at
FROM users
WHERE id = :id
LIMIT 1;
