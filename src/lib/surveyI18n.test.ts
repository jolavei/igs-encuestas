import { describe, expect, it } from "vitest";
import {
  localizeSections,
  planDictionaryTranslations,
  planTranslations,
  translateError,
} from "./surveyI18n";

describe("planDictionaryTranslations", () => {
  it("traduce por texto, conserva lo existente y lista lo que falta", () => {
    const qs = [
      {
        id: "a",
        order: 7,
        text: "¿Usó  los baños del aeropuerto?",
        sectionId: "s1",
        config: JSON.stringify({ options: [{ value: "Sí", label: "Sí" }, { value: "Otro", label: "Otro" }] }),
      },
      { id: "b", order: 8, text: "Pregunta nueva", sectionId: "s1", config: null },
      { id: "c", order: 9, text: "SCL", sectionId: "s1", config: null },
    ];
    const plan = planDictionaryTranslations(
      qs,
      [{ id: "s1", order: 1, title: "Baños", description: null, titleEn: null, descriptionEn: null }],
      new Map([["b", "Kept EN"]]),
      { "¿Usó los baños del aeropuerto?": "Did you use the airport restrooms?", "Sí": "Yes", "Baños": "Restrooms" }
    );
    expect(plan.sections[0].titleEn).toBe("Restrooms");
    expect(plan.questions.find((q) => q.id === "a")!.textEn).toBe("Did you use the airport restrooms?");
    expect(JSON.parse(plan.questions[0].config!).options).toEqual([
      { value: "Sí", label: "Sí", labelEn: "Yes" },
      { value: "Otro", label: "Otro" },
    ]);
    expect(plan.questions.find((q) => q.id === "b")!.textEn).toBe("Kept EN");
    expect(plan.untranslated.sort()).toEqual(["Otro", "Pregunta nueva"]);
  });
});
import type { ClientSection } from "@/components/QuestionInput";

const sections: ClientSection[] = [
  {
    order: 1,
    title: "Baños",
    titleEn: "Restrooms",
    description: null,
    routing: "NEXT",
    questions: [
      {
        id: "q1",
        order: 1,
        type: "SINGLE_CHOICE",
        text: "¿Usó los baños del aeropuerto?",
        textEn: "Did you use the airport restrooms?",
        required: true,
        config: {
          options: [
            { value: "Sí", label: "Sí", labelEn: "Yes" },
            { value: "No", label: "No", labelEn: "No", goto: "GOTO:3" },
          ],
        },
      },
      {
        id: "q2",
        order: 2,
        type: "RATING",
        text: "Aseo e higiene de los baños",
        textEn: "",
        required: true,
        config: { maxStars: 5 },
      },
    ],
  },
];

describe("localizeSections", () => {
  it("en español devuelve las secciones tal cual", () => {
    expect(localizeSections(sections, "es")).toBe(sections);
  });

  it("en inglés traduce textos y etiquetas, pero no ids, values ni ruteo", () => {
    const [s] = localizeSections(sections, "en");
    expect(s.title).toBe("Restrooms");
    expect(s.questions[0].text).toBe("Did you use the airport restrooms?");
    expect(s.questions[0].id).toBe("q1");
    const opts = s.questions[0].config!.options!;
    expect(opts.map((o) => o.label)).toEqual(["Yes", "No"]);
    expect(opts.map((o) => o.value)).toEqual(["Sí", "No"]);
    expect(opts[1].goto).toBe("GOTO:3");
  });

  it("si falta la traducción, muestra el español", () => {
    const [s] = localizeSections(sections, "en");
    expect(s.questions[1].text).toBe("Aseo e higiene de los baños");
  });
});

describe("translateError", () => {
  it("traduce los mensajes de validación conocidos", () => {
    expect(translateError("Esta pregunta es obligatoria.", "en")).toBe("This question is required.");
    expect(translateError("Máximo 200 caracteres.", "en")).toBe("Maximum 200 characters.");
    expect(translateError("Calificación fuera de rango (1-5) o N/A.", "en")).toBe(
      "Choose a rating from 1 to 5, or N/A."
    );
  });
  it("en español o si no lo reconoce, lo deja igual", () => {
    expect(translateError("Esta pregunta es obligatoria.", "es")).toBe("Esta pregunta es obligatoria.");
    expect(translateError("Otro mensaje.", "en")).toBe("Otro mensaje.");
  });
});

describe("planTranslations", () => {
  const dbSections = [{ id: "s1", order: 1, title: "Baños" }];
  const dbQuestions = [
    {
      id: "q1",
      order: 1,
      text: "¿Usó los baños del aeropuerto?",
      sectionId: "s1",
      config: JSON.stringify({
        options: [
          { value: "Sí", label: "Sí" },
          { value: "No", label: "No", goto: "GOTO:3" },
        ],
        multi: false,
      }),
    },
  ];

  it("guarda textEn y labelEn sin tocar values ni ruteo", () => {
    const plan = planTranslations(dbQuestions, dbSections, [
      {
        order: 1,
        title: "Baños",
        titleEn: "Restrooms",
        questions: [
          {
            order: 1,
            text: "¿Usó los baños del aeropuerto?",
            textEn: " Did you use the airport restrooms? ",
            options: [
              { value: "Sí", labelEn: "Yes" },
              { value: "No", labelEn: "No" },
            ],
          },
        ],
      },
    ]);
    expect(plan.mismatches).toEqual([]);
    expect(plan.sections).toEqual([{ id: "s1", titleEn: "Restrooms", descriptionEn: null }]);
    expect(plan.questions[0].textEn).toBe("Did you use the airport restrooms?");
    const cfg = JSON.parse(plan.questions[0].config!);
    expect(cfg.options).toEqual([
      { value: "Sí", label: "Sí", labelEn: "Yes" },
      { value: "No", label: "No", goto: "GOTO:3", labelEn: "No" },
    ]);
    expect(cfg.multi).toBe(false);
  });

  it("rechaza si el texto en español cambió o la opción no existe", () => {
    const plan = planTranslations(dbQuestions, dbSections, [
      {
        order: 1,
        title: "Baños públicos",
        questions: [
          { order: 1, text: "¿Usó el baño?", textEn: "Did you?" },
          { order: 9, text: "x" },
        ],
      },
    ]);
    expect(plan.mismatches).toHaveLength(3);
    expect(plan.questions).toEqual([]);
    expect(plan.sections).toEqual([]);

    const plan2 = planTranslations(dbQuestions, dbSections, [
      {
        order: 1,
        title: "Baños",
        questions: [
          { order: 1, text: "¿Usó los baños del aeropuerto?", options: [{ value: "Tal vez", labelEn: "Maybe" }] },
        ],
      },
    ]);
    expect(plan2.mismatches).toHaveLength(1);
    expect(plan2.questions).toEqual([]);
  });

  it("borrar la traducción de una opción la quita del config", () => {
    const withEn = [
      {
        ...dbQuestions[0],
        config: JSON.stringify({ options: [{ value: "Sí", label: "Sí", labelEn: "Yes" }] }),
      },
    ];
    const plan = planTranslations(withEn, dbSections, [
      {
        order: 1,
        title: "Baños",
        questions: [
          { order: 1, text: "¿Usó los baños del aeropuerto?", options: [{ value: "Sí", labelEn: "" }] },
        ],
      },
    ]);
    expect(JSON.parse(plan.questions[0].config!).options).toEqual([{ value: "Sí", label: "Sí" }]);
  });
});
