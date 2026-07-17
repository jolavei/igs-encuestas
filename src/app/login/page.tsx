"use client";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Opt-in explícito: en producción se omite esta variable y el login dev no aparece.
  const devEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(e);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo variant="full" className="h-16 w-auto" />
        <h1 className="text-lg font-semibold text-slate-700">Login</h1>
      </div>

      {error && (
        <div className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error === "AccessDenied"
            ? "Tu correo no está autorizado. Pide a un administrador que registre tu cuenta antes de ingresar."
            : "No se pudo iniciar sesión. Intenta de nuevo."}
        </div>
      )}

      <div className="card w-full space-y-4">
        <div className="flex items-center justify-center gap-6">
          <ProviderCircle
            label="Entrar con Google"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            <GoogleIcon />
          </ProviderCircle>

          <ProviderCircle
            label="Entrar con Microsoft"
            onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
          >
            <MicrosoftIcon />
          </ProviderCircle>

          <ProviderCircle
            label="Entrar con Yahoo"
            onClick={() => signIn("yahoo", { callbackUrl: "/" })}
          >
            <YahooIcon />
          </ProviderCircle>
        </div>

        {devEnabled && (
          <>
            <div className="relative text-center text-xs text-slate-400">
              <span className="bg-white px-2">o (solo desarrollo)</span>
            </div>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                signIn("dev", { email, callbackUrl: "/" });
              }}
            >
              <input
                className="input"
                type="email"
                required
                placeholder="tu@correo.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn-secondary w-full" type="submit">
                Entrar (dev)
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

// Botón circular reutilizable para cada proveedor. El nombre va en aria-label y
// title porque ya no hay texto visible (solo el ícono de marca).
function ProviderCircle({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-white shadow-sm transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      {children}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-7 w-7" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="h-6 w-6" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function YahooIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <text
        x="12"
        y="18"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="20"
        fontWeight="700"
        fill="#5F01D1"
      >
        y!
      </text>
    </svg>
  );
}
