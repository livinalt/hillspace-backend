/**
 * Public API origin for links embedded in emails.
 * Prefer BACKEND_URL / API_URL; on Render, RENDER_EXTERNAL_URL is set automatically.
 */
export function getPublicApiBaseUrl(): string {
  const raw =
    process.env.BACKEND_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    'http://localhost:3000';

  const base = raw.replace(/\/$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

export function getPublicFrontendBaseUrl(): string {
  return (
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}
