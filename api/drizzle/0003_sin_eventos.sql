-- Se va el tipo 'evento' y con él toda la maquinaria de invitaciones padre e
-- hijas. Un evento pasa a ser lo que ya era en los hechos: una invitación por
-- invitado.
--
-- Los datos existentes se conservan como invitaciones sueltas. Cada anotado YA
-- era una invitación por invitado, con su token, sus fechas y sus ingresos, así
-- que pasa a 'visita' sin perder nada más que a qué evento pertenecía — dato
-- que en el modelo nuevo no significa nada.

UPDATE "invitation" SET "kind" = 'visita', "parent_id" = NULL
WHERE "parent_id" IS NOT NULL;--> statement-breakpoint

-- El paraguas del evento no tiene equivalente, pero no se borra: entry_log
-- puede apuntarle (quien entró sin anotarse, con el QR compartido) y borrarlo
-- se llevaría puesta esa parte de la bitácora. Queda como visita con su cupo.
UPDATE "invitation" SET "kind" = 'visita' WHERE "kind" = 'evento';--> statement-breakpoint

ALTER TABLE "invitation" DROP CONSTRAINT "invitation_kind_ck";--> statement-breakpoint

-- Los tres se agregaron a mano en 0002 y drizzle-kit no los conoce, así que
-- los baja también a mano. IF EXISTS porque DROP COLUMN ya se lleva puestos los
-- que dependen de la columna.
DROP INDEX IF EXISTS "invitation_event_doc_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "invitation_parent_idx";--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT IF EXISTS "invitation_parent_fk";--> statement-breakpoint

ALTER TABLE "invitation" DROP COLUMN "parent_id";--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_kind_ck" CHECK ("invitation"."kind" in ('visita','frecuente','proveedor'));
