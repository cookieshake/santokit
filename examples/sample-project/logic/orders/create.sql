---
# Create Order
# Endpoint: POST /orders/create
target: main
params:
  items:
    type: json
    required: true
access: authenticated
---

INSERT INTO orders (user_id, total_amount, items)
VALUES (
  :user_id,
  (
    SELECT COALESCE(SUM((item->>'price')::decimal * (item->>'quantity')::int), 0)
    FROM jsonb_array_elements(:items::jsonb) AS item
  ),
  :items::jsonb
)
RETURNING 
  id,
  user_id,
  status,
  total_amount,
  items,
  created_at;
