/**
 * CORS configuration.
 *
 * In production we restrict to our actual GitHub Pages origins.
 * In development we allow any localhost origin for convenience.
 */
const ALLOWED_ORIGINS = [
  'https://aleto44.github.io',
];
/**
 * Returns the correct Access-Control-Allow-Origin value for the incoming request.
 * - In non-production: any localhost/127.0.0.1 origin is reflected back (dev convenience).
 * - In production: only whitelisted origins are allowed.
 */
export function getAllowedOrigin(requestOrigin, env) {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (env?.ENVIRONMENT !== 'production') {
    if (
      requestOrigin.startsWith('http://localhost') ||
      requestOrigin.startsWith('http://127.0.0.1')
    ) {
      return requestOrigin;
    }
  }
  if (ALLOWED_ORIGINS.some(o => requestOrigin === o || requestOrigin.startsWith(o))) {
    return requestOrigin;
  }
  return ALLOWED_ORIGINS[0];
}
export function corsHeaders(requestOrigin, env) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(requestOrigin, env),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}
export function handleCors(request, env) {
  const origin = request?.headers?.get('Origin') ?? '';
  return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
}
