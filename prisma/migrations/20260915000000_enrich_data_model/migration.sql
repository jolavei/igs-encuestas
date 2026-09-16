-- Enriquecimiento del modelo de datos: metadatos operativos, de contacto y de calidad.
-- Todas las columnas son aditivas y nullable (o con default), así que es compatible
-- hacia atrás: no rompe filas existentes ni la app en ejecución.

-- User: última vez que inició sesión (métrica de actividad).
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Company: datos de contacto/identificación del cliente.
ALTER TABLE "Company" ADD COLUMN "rut" TEXT;
ALTER TABLE "Company" ADD COLUMN "email" TEXT;
ALTER TABLE "Company" ADD COLUMN "phone" TEXT;

-- Location: identidad de aeropuerto y zona horaria.
ALTER TABLE "Location" ADD COLUMN "iataCode" TEXT;
ALTER TABLE "Location" ADD COLUMN "icaoCode" TEXT;
ALTER TABLE "Location" ADD COLUMN "timezone" TEXT;

-- ResponseSet: métricas de la toma (tiempos + dispositivo).
ALTER TABLE "ResponseSet" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "ResponseSet" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "ResponseSet" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "ResponseSet" ADD COLUMN "deviceType" TEXT;

-- Document: descripción, marca de actualización y borrado lógico.
ALTER TABLE "Document" ADD COLUMN "description" TEXT;
ALTER TABLE "Document" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Índice para filtrar documentos vigentes (deletedAt IS NULL) en los listados.
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
