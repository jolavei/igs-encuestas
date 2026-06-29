"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  // Opt-in explícito: en producción se omite esta variable y el login dev no aparece.
  const devEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">IGS Encuestas</h1>
        <p className="text-slate-600">Plataforma CSAT / NPS</p>
      </div>

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
