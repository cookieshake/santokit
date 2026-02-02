---
access: public
params:
  message:
    type: string
    required: true
---

export default async function (params) {
  return { echo: params.message };
}
