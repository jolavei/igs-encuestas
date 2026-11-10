import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { rateLimit } from "@/lib/rateLimit";
import { TranslateNotConfiguredError, translateEsToEn } from "@/lib/translate";

const schema = z.object({
  texts: z.array(z.string().max(2000)).min(1).max(1000),
});

// Borrador de traducción ES → EN para el constructor de cuestionarios (solo admin).
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const rl = rateLimit(`translate:${user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas traducciones seguidas. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  try {
    const translations = await translateEsToEn(parsed.data.texts);
    return NextResponse.json({ translations });
  } catch (e) {
    if (e instanceof TranslateNotConfiguredError) {
      return NextResponse.json(
        { error: "La traducción automática no está configurada en este servidor." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo traducir." },
      { status: 502 }
    );
  }
}
