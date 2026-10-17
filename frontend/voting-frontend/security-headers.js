// Browser safety headers for the website. `npm run preview` sends them; whatever hosts
// the built site (dist/) in production must send the same ones (see README, Hosting).
//
// Content-Security-Policy lists what the page may load. Everything comes from our own
// address ('self'). Exceptions, and why:
//  - 'wasm-unsafe-eval': the zero-knowledge proof is computed by WebAssembly.
//  - blob: workers: the proof library runs its maths in background workers made from blobs.
//  - data:/blob: images: photo previews while an admin uploads a candidate photo.
// Inline <script> and <style> tags are forbidden, which is what stops injected code from
// running. (React's style={...} props still work: they're set from our own script.)
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders = {
  "Content-Security-Policy": contentSecurityPolicy,
  "X-Frame-Options": "DENY", // older browsers' version of frame-ancestors: nobody may frame us
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// `npm run dev` can't use the CSP: Vite's live reload injects inline scripts.
const { "Content-Security-Policy": _csp, ...devHeaders } = securityHeaders;
export { devHeaders };
