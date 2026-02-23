---
auth: authenticated
condition: request.auth.roles == "authenticated"
---
SELECT :auth.sub as sub
