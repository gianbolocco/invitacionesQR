ALTER TABLE "entry_log" ADD COLUMN "overstay_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entry_log" ADD COLUMN "overstay_seen_by" uuid;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "overstay_hours_visita" smallint;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "overstay_hours_proveedor" smallint;--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_log_overstay_seen_by_person_id_fk" FOREIGN KEY ("overstay_seen_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD CONSTRAINT "neighborhood_overstay_visita_ck" CHECK ("neighborhood"."overstay_hours_visita" between 1 and 72);--> statement-breakpoint
ALTER TABLE "neighborhood" ADD CONSTRAINT "neighborhood_overstay_proveedor_ck" CHECK ("neighborhood"."overstay_hours_proveedor" between 1 and 72);