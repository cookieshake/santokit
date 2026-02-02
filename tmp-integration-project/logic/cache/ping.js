---
access: public
cache: "1m"
---

export default async function () {
  return { ts: Date.now() };
}
