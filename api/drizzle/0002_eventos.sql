ALTER TABLE "invitation" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "map_url" text;--> statement-breakpoint
CREATE INDEX "invitation_parent_idx" ON "invitation" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_parent_fk"
  FOREIGN KEY ("parent_id") REFERENCES "invitation"("id");--> statement-breakpoint
-- Deduplica anotaciones al mismo evento: el mismo documento no quema dos lugares.
-- Parcial y con lower(): drizzle-kit no lo expresa, va a mano.
CREATE UNIQUE INDEX "invitation_event_doc_uq" ON "invitation" (parent_id, lower(guest_doc))
  WHERE parent_id IS NOT NULL AND guest_doc IS NOT NULL;
