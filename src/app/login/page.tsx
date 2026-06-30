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
        <p className="text-sm text-slate-500">Plataforma de encuestas CSAT / NPS</p>
      </div>

      {error && (
        <div className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error === "AccessDenied"
            ? "Tu correo no está autorizado. Pide a un administrador que registre tu cuenta antes de ingresar."
            : "No se pudo iniciar sesión. Intenta de nuevo."}
        </div>
      )}

      <div className="card w-full space-y-4">
        <button
          className="btn w-full"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          Entrar con Google
        </button>

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
