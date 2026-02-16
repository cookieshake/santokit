---
auth: public
params:
  greeting:
    type: string
    default: "hello"
---
SELECT :greeting as greeting
