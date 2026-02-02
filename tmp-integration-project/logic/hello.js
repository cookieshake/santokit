---
target: main
access: public
params:
  name:
    type: string
    required: false
    default: "World"
---

export default async function(context) {
  const { name } = context.params;
  return {
    message: "Hello, " + name + "!"
  };
}