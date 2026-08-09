/** @type {import('next').NextConfig} */

// Cabeceras de seguridad aplicadas a todas las rutas.
// - Las básicas (nosniff, anti-clickjacking, referrer, permissions) van siempre.
// - HSTS y CSP solo en producción: en `next dev` el HMR usa eval/inline y una CSP
//   estricta rompería el desarrollo; HSTS sobre http local no aplica.
const isProd = process.env.NODE_ENV === "production";

// CSP pragmática (sin nonces): permite el inline que Next inyecta para hidratar y
// Tailwind. `connect-src` incluye GCS porque el navegador sube archivos con un PUT
// directo a la URL firmada (storage.googleapis.com). Endurecer a nonces es una
// mejora futura (requiere tocar el middleware).
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://storage.googleapis.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  ...(isProd
    ? [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Content-Security-Policy", value: csp },
      ]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Sin caché de router en cliente: al navegar entre secciones siempre re-consulta
  // la base (evita ver datos "viejos" tras crear/editar).
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
