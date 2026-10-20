ALTER TABLE "invitation" ADD COLUMN "frequent_as" text;--> statement-breakpoint
-- Las frecuentes que ya existen no tenían subtipo: casi todas son personal de la casa.
UPDATE "invitation" SET "frequent_as" = 'visita' WHERE "kind" = 'frecuente';--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_frequent_as_ck" CHECK ("invitation"."frequent_as" is null
    or ("invitation"."kind" = 'frecuente' and "invitation"."frequent_as" in ('visita','proveedor')));