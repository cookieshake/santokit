---
access: public
---

export default async function (_params, context) {
  try {
    await context.storage.delete('test', 'file.txt');
  } catch (error) {
    return { deleted: true, error: String(error) };
  }
  return { deleted: true };
}
