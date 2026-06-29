import Link from "next/link";

export default function Denegado() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Acceso denegado</h1>
      <p className="text-slate-600">Tu rol no tiene permiso para ver esta sección.</p>
      <Link href="/" className="btn">Volver al inicio</Link>
    </main>
  );
}
