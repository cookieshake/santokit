---
auth: authenticated
params:
  greeting:
    type: string
    default: "world"
  count:
    type: int
    default: 1
---
SELECT :greeting as greeting, :count as count
