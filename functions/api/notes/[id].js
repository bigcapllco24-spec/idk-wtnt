import { ensureSchema, handle, json, requireAdmin } from '../../_lib.js';

// DELETE /api/notes/:id (admin) -> remove a guestbook note
export const onRequestDelete = handle(async ({ request, env, params }) => {
  requireAdmin(request, env);
  await ensureSchema(env);
  await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(params.id).run();
  return json({ deleted: params.id });
});
