---
# List Orders for User
# Endpoint: GET /orders/list
target: main
params:
  limit:
    type: int
    default: 20
  offset:
    type: int
    default: 0
  status:
    type: string
access: authenticated
---

SELECT 
  id,
  user_id,
  status,
  total_amount,
  items,
  created_at,
  updated_at
FROM orders
WHERE user_id = :user_id
  AND (:status IS NULL OR status = :status)
ORDER BY created_at DESC
LIMIT :limit
OFFSET :offset;
