/** No environment secrets belong in this browser policy. */
export function contentSecurityPolicy(nonce: string, development = false) {
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
  const authFrame = /^[a-z0-9.-]{1,253}$/i.test(authDomain)
    ? `https://${authDomain}`
    : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Motion, Recharts and current React layouts use style attributes. Scripts remain nonce-only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com",
    "font-src 'self'",
    `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/${development ? " ws: http://127.0.0.1:9144" : ""}`,
    // Firebase may require CAPTCHA after provider-side abuse detection. Keep that
    // narrow identity integration compatible, never allow arbitrary provider frames.
    `frame-src ${authFrame} https://www.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "worker-src 'none'",
  ].join("; ");
}
export const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
