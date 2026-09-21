import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dispara el workflow de GitHub Actions que refresca los itinerarios (job mensual),
// para poder correrlo a demanda desde la app. Requiere un token de GitHub con permiso
// de Actions (PAT clásico con scope "workflow", o fine-grained con "Actions: write")
// en la variable de entorno GITHUB_DISPATCH_TOKEN.
const REPO = process.env.GITHUB_REPO ?? "jolavei/igs-encuestas";
const WORKFLOW = "planificacion-flights.yml";
const REF = process.env.GITHUB_DISPATCH_REF ?? "main";

export async function POST() {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Falta configurar GITHUB_DISPATCH_TOKEN (token de GitHub con permiso de Actions)." },
      { status: 501 },
    );
  }

  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "igs-encuestas",
      },
      body: JSON.stringify({ ref: REF }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red al contactar GitHub.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // GitHub responde 204 (sin cuerpo) al aceptar el dispatch.
  if (res.status === 204) {
    return NextResponse.json({ ok: true });
  }
  const detail = await res.text().catch(() => "");
  const hint =
    res.status === 401 || res.status === 403
      ? " Revisa que el token tenga permiso de Actions y acceso al repo."
      : res.status === 404
        ? " Revisa el repo/nombre del workflow y que el token tenga acceso."
        : "";
  return NextResponse.json(
    { error: `GitHub respondió ${res.status}.${hint} ${detail.slice(0, 200)}`.trim() },
    { status: 502 },
  );
}
