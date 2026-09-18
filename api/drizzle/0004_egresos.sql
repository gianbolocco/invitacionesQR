ALTER TABLE "entry_log" ADD COLUMN "exited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entry_log" ADD COLUMN "exit_guard_id" uuid;--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_log_exit_guard_id_person_id_fk" FOREIGN KEY ("exit_guard_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- La consulta caliente del egreso: ¿esta invitación tiene alguien adentro?
-- Parcial porque las filas cerradas no se consultan nunca por este camino, y
-- drizzle-kit no expresa el WHERE de un índice. Va a mano, igual que en 0002.
CREATE INDEX "entry_open_idx" ON "entry_log" ("invitation_id") WHERE "exited_at" IS NULL;
