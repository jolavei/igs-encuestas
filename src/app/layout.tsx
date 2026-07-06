import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

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
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
