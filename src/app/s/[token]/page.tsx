import { prisma } from "@/lib/prisma";
import SurveyRunner from "@/components/SurveyRunner";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
import { buildClientSections } from "@/lib/surveyForm";

// Flujo publico via QR: sin login. Resuelve la version ACTIVE del cuestionario.
export default async function PublicSurvey({
  params,
}: {
  params: { token: string };
}) {
  const qr = await prisma.qrToken.findUnique({
    where: { token: params.token },
    include: { questionnaire: true, location: true },
  });

  const version =
    qr && qr.active
      ? await prisma.questionnaireVersion.findFirst({
          where: { questionnaireId: qr.questionnaireId, status: "ACTIVE" },
          orderBy: { versionNumber: "desc" },
          include: {
            questions: { orderBy: { order: "asc" } },
            sections: { orderBy: { order: "asc" } },
          },
        })
      : null;

  if (!qr || !qr.active || !version) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <div className="card text-center">
          <h1 className="text-lg font-semibold">Encuesta no disponible</h1>
          <p className="text-slate-600">El código QR no es válido o no hay una versión activa.</p>
        </div>
      </main>
    );
  }

  const sections = buildClientSections(version.questions, version.sections);

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4">
      <div className="flex justify-center pt-6">
        <Logo variant="full" className="h-12 w-auto" />
      </div>
      <p className="px-5 pt-3 text-center text-xs text-slate-400 sm:px-8">
        Tus respuestas son anónimas y se usan para mejorar el servicio.
      </p>
      <SurveyRunner
        sections={sections}
        endpoint={`/api/public/${params.token}`}
        title={qr.questionnaire.title}
        subtitle={`${qr.location.name}`}
      />
    </main>
  );
}
