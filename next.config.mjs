/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Sin caché de router en cliente: al navegar entre secciones siempre re-consulta
  // la base (evita ver datos "viejos" tras crear/editar).
  experimental: {
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
