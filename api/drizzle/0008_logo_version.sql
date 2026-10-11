ALTER TABLE "neighborhood" ADD COLUMN "logo_updated_at" timestamp with time zone;--> statement-breakpoint
-- Los logos subidos antes de esta migración también necesitan versión: sin ella
-- la URL del logo no cambia y el navegador sigue mostrando el que tiene en caché.
UPDATE "neighborhood" SET "logo_updated_at" = now() WHERE "logo_mime" IS NOT NULL;