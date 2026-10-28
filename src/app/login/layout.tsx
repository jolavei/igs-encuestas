import type { Metadata } from "next";

// Única página que queremos en Google: el acceso al portal. La canónica sin
// query string agrupa todas las variantes /login?callbackUrl=... en una sola.
export const metadata: Metadata = {
  title: "Acceso portal — Aeródromos IGS",
  alternates: { canonical: "/login" },
  robots: { index: true, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
