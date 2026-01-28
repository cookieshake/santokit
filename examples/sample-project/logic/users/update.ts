/**
 * target: main
 * params:
 *   id:
 *     type: string
 *     required: true
 *   name:
 *     type: string
 *   avatarUrl:
 *     type: string
 *   metadata:
 *     type: json
 * access: authenticated
 */
export default async function handler(params, context) {
  const { id, name, avatarUrl, metadata } = params;

  // Verify the user is updating their own profile or is admin
  if (
    context.request.user?.id !== id &&
    !context.request.user?.roles.includes('admin')
  ) {
    throw new Error('Unauthorized');
  }

  // Build update fields
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(name);
  }

  if (avatarUrl !== undefined) {
    updates.push(`avatar_url = $${paramIndex++}`);
    values.push(avatarUrl);
  }

  if (metadata !== undefined) {
    updates.push(`metadata = metadata || $${paramIndex++}::jsonb`);
    values.push(JSON.stringify(metadata));
  }

  if (updates.length === 0) {
    return { updated: false, message: 'No fields to update' };
  }

  // Add updated_at
  updates.push(`updated_at = now()`);

  // Add WHERE clause parameter
  values.push(id);

  const sql = `
    UPDATE users 
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, email, name, avatar_url, roles, metadata, updated_at
  `;

  const result = await context.db.query('main', sql, values);

  if (result.length === 0) {
    throw new Error('User not found');
  }

  return { updated: true, user: result[0] };
}
