import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import Providers from "./providers";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ChunkErrorReload from "@/components/ChunkErrorReload";

// Google Analytics (GA4). Se puede sobreescribir el ID por entorno con
// NEXT_PUBLIC_GA_ID; si no, usa el de la propiedad "Aeródromos IGS".
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-JFR58BMDXJ";

export const metadata: Metadata = {
  title: "Aeródromos IGS — Encuestas",
  description: "Plataforma de encuestas y benchmarking de satisfacción.",
  manifest: "/manifest.json",
  // El favicon y el ícono de Apple se generan por convención de archivos:
  // src/app/icon.png y src/app/apple-icon.png (Next inyecta los <link> solo).
};

export const viewport: Viewport = {
  themeColor: "#003152",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
        <ChunkErrorReload />
        <ServiceWorkerRegister />
        {/* GA solo en producción para no ensuciar los datos con la navegación
            local (`next dev`). Verás las visitas en GA4 → Tiempo real. */}
        {process.env.NODE_ENV === "production" && (
          <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
