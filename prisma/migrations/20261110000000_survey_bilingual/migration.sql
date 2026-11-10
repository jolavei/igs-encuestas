-- Encuesta bilingüe (botón ES | EN)
ALTER TABLE "Questionnaire" ADD COLUMN "bilingual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Questionnaire" ADD COLUMN "titleEn" TEXT;

ALTER TABLE "QuestionSection" ADD COLUMN "titleEn" TEXT;
ALTER TABLE "QuestionSection" ADD COLUMN "descriptionEn" TEXT;

ALTER TABLE "Question" ADD COLUMN "textEn" TEXT;

-- Idioma en que se respondió ("es" | "en")
ALTER TABLE "ResponseSet" ADD COLUMN "language" TEXT;
