import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "jolave@aerodromosigs.cl").toLowerCase();

  // --- Empresas + sedes ---
  const company = await prisma.company.create({
    data: {
      name: "Hotel Costa Azul",
      kind: "hotel",
      locations: {
        create: [
          { name: "Sede Santiago", city: "Santiago" },
          { name: "Sede Viña del Mar", city: "Viña del Mar" },
        ],
      },
    },
    include: { locations: true },
  });

  // Segunda empresa para demostrar el mismo cuestionario en varias empresas.
  const company2 = await prisma.company.create({
    data: {
      name: "Hotel Cordillera",
      kind: "hotel",
      locations: { create: [{ name: "Sede Pucón", city: "Pucón" }] },
    },
    include: { locations: true },
  });

  // --- Usuarios ---
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: { email: adminEmail, name: "Admin", role: "ADMIN" },
  });

  const surveyor = await prisma.user.upsert({
    where: { email: "encuestador@demo.cl" },
    update: { role: "SURVEYOR" },
    create: { email: "encuestador@demo.cl", name: "Encuestador Demo", role: "SURVEYOR" },
  });

  await prisma.user.upsert({
    where: { email: "cliente@demo.cl" },
    update: { role: "CLIENT", companyId: company.id },
    create: {
      email: "cliente@demo.cl",
      name: "Cliente Demo",
      role: "CLIENT",
      companyId: company.id,
    },
  });

  // --- Cuestionario asignado a AMBAS empresas + version ACTIVE v1 ---
  const questionnaire = await prisma.questionnaire.create({
    data: {
      title: "Satisfacción de huéspedes",
      companies: { connect: [{ id: company.id }, { id: company2.id }] },
    },
  });

  const version = await prisma.questionnaireVersion.create({
    data: {
      questionnaireId: questionnaire.id,
      versionNumber: 1,
      status: "ACTIVE",
      publishedAt: new Date(),
      createdById: admin.id,
      questions: {
        create: [
          {
            order: 1,
            type: "NPS",
            text: "¿Qué tan probable es que recomiendes nuestro hotel? (0-10)",
            required: true,
            equivalenceKey: "nps_general",
            bqColumnName: "nps_recomendacion",
            bqType: "INT64",
            bqDescription: "Probabilidad de recomendación (0-10)",
          },
          {
            order: 2,
            type: "LIKERT",
            text: "¿Cómo evalúas la limpieza de la habitación?",
            required: true,
            config: JSON.stringify({ min: 1, max: 5 }),
            equivalenceKey: "csat_limpieza",
            bqColumnName: "csat_limpieza",
            bqType: "INT64",
            bqDescription: "Satisfacción con limpieza de habitación (escala 1-5)",
          },
          {
            order: 3,
            type: "SINGLE_CHOICE",
            text: "¿Cuál fue el motivo principal de tu visita?",
            required: false,
            config: JSON.stringify({
              options: [
                { value: "negocios", label: "Negocios" },
                { value: "turismo", label: "Turismo" },
                { value: "evento", label: "Evento" },
              ],
            }),
            equivalenceKey: "motivo_visita",
            bqColumnName: "motivo_visita",
            bqType: "STRING",
            bqDescription: "Motivo principal de la visita",
          },
          {
            order: 4,
            type: "TEXT",
            text: "¿Algún comentario para mejorar?",
            required: false,
            config: JSON.stringify({ maxLength: 500 }),
            equivalenceKey: "comentario_libre",
            bqColumnName: "comentario_libre",
            bqType: "STRING",
            bqDescription: "Comentario abierto del huésped",
          },
          {
            order: 5,
            type: "SINGLE_CHOICE",
            text: "¿Por qué canal reservaste?",
            required: false,
            config: JSON.stringify({
              options: [
                { value: "directo", label: "Directo" },
                { value: "agencia", label: "Agencia" },
                { value: "online", label: "Online" },
              ],
            }),
            equivalenceKey: "canal_reserva",
            bqColumnName: "canal_reserva",
            bqType: "STRING",
            bqDescription: "Canal de reserva",
          },
        ],
      },
    },
    include: { questions: true },
  });

  const npsQ = version.questions.find((q) => q.type === "NPS")!;
  const likertQ = version.questions.find((q) => q.type === "LIKERT")!;
  const motivoQ = version.questions.find((q) => q.equivalenceKey === "motivo_visita")!;
  const canalQ = version.questions.find((q) => q.equivalenceKey === "canal_reserva")!;

  // --- QR token por sede (de ambas empresas) ---
  for (const loc of [...company.locations, ...company2.locations]) {
    await prisma.qrToken.create({
      data: {
        token: randomBytes(9).toString("base64url"),
        questionnaireId: questionnaire.id,
        locationId: loc.id,
      },
    });
  }

  // --- Plan de trabajo con metas de DOS niveles: motivo de visita → canal de reserva ---
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const plan = await prisma.workPlan.create({
    data: {
      companyId: company.id,
      questionnaireId: questionnaire.id,
      locationId: company.locations[0].id,
      windowStart: now,
      windowEnd: in30,
      totalTarget: 50,
      segmentKey: "motivo_visita",
      segmentLabel: "Motivo de visita",
      segment2Key: "canal_reserva",
      segment2Label: "Canal de reserva",
      comment: "Completar 50 encuestas este mes, priorizando pasajeros de negocios.",
      createdById: admin.id,
      surveyors: { connect: [{ id: surveyor.id }] },
      segments: {
        create: [
          // Nivel 1 (motivo)
          { parentValue: null, value: "negocios", label: "Negocios", target: 20 },
          { parentValue: null, value: "turismo", label: "Turismo", target: 20 },
          { parentValue: null, value: "evento", label: "Evento", target: 10 },
          // Nivel 2 (canal, dentro de cada motivo)
          { parentValue: "negocios", value: "directo", label: "Directo", target: 10 },
          { parentValue: "negocios", value: "agencia", label: "Agencia", target: 6 },
          { parentValue: "negocios", value: "online", label: "Online", target: 4 },
          { parentValue: "turismo", value: "online", label: "Online", target: 12 },
          { parentValue: "turismo", value: "agencia", label: "Agencia", target: 8 },
        ],
      },
    },
  });

  // Levantamientos de campo ligados al plan (demo del avance por segmento, 2 niveles).
  for (const s of [
    { motivo: "negocios", canal: "directo", nps: 9, likert: 5 },
    { motivo: "negocios", canal: "agencia", nps: 8, likert: 4 },
    { motivo: "turismo", canal: "online", nps: 7, likert: 4 },
  ]) {
    await prisma.responseSet.create({
      data: {
        versionId: version.id,
        locationId: company.locations[0].id,
        source: "FIELD",
        surveyorId: surveyor.id,
        workPlanId: plan.id,
        segmentValue: s.motivo,
        segmentValue2: s.canal,
        answers: {
          create: [
            { questionId: npsQ.id, valueNumber: s.nps },
            { questionId: likertQ.id, valueNumber: s.likert },
            { questionId: motivoQ.id, valueText: s.motivo },
            { questionId: canalQ.id, valueText: s.canal },
          ],
        },
      },
    });
  }

  // --- Respuestas de ejemplo (NPS + CSAT) ---
  const samples = [
    { loc: 0, nps: 9, likert: 5 },
    { loc: 0, nps: 8, likert: 4 },
    { loc: 0, nps: 6, likert: 3 },
    { loc: 1, nps: 10, likert: 5 },
    { loc: 1, nps: 3, likert: 2 },
  ];
  for (const s of samples) {
    await prisma.responseSet.create({
      data: {
        versionId: version.id,
        locationId: company.locations[s.loc].id,
        source: "QR_PUBLIC",
        answers: {
          create: [
            { questionId: npsQ.id, valueNumber: s.nps },
            { questionId: likertQ.id, valueNumber: s.likert },
          ],
        },
      },
    });
  }

  // Respuestas de la segunda empresa (mismo cuestionario) -> demo benchmarking cruzado.
  for (const s of [{ nps: 7, likert: 4 }, { nps: 9, likert: 5 }]) {
    await prisma.responseSet.create({
      data: {
        versionId: version.id,
        locationId: company2.locations[0].id,
        source: "QR_PUBLIC",
        answers: {
          create: [
            { questionId: npsQ.id, valueNumber: s.nps },
            { questionId: likertQ.id, valueNumber: s.likert },
          ],
        },
      },
    });
  }

  console.log("Seed OK");
  console.log("Admin:", adminEmail);
  console.log("Encuestador: encuestador@demo.cl | Cliente: cliente@demo.cl");
  const tokens = await prisma.qrToken.findMany({ include: { location: true } });
  tokens.forEach((t) => console.log(`QR ${t.location.name}: /s/${t.token}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
