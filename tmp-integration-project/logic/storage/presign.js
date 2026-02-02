---
access: public
---

export default async function (_params, context) {
  const uploadUrl = await context.storage.createUploadUrl('test', 'file.txt');
  const downloadUrl = await context.storage.createDownloadUrl('test', 'file.txt');
  return { uploadUrl, downloadUrl };
}
