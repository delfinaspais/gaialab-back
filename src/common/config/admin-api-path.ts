/**
 * Segmento de URL del API de administración (panel privado).
 * Ej: "admin" → GET /api/admin/dashboard ; "panel-secreto" → GET /api/panel-secreto/dashboard
 * Configurar con ADMIN_API_SEGMENT en .env (sin slashes).
 */
export function getAdminApiSegment(): string {
  const raw = process.env.ADMIN_API_SEGMENT ?? 'admin';
  const seg = raw.replace(/^\/+|\/+$/g, '').trim();
  return seg.length ? seg : 'admin';
}
