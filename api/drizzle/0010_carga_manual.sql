ALTER TABLE "entry_log" ADD COLUMN "source" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "entry_log" ADD COLUMN "loaded_by" uuid;--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_log_loaded_by_person_id_fk" FOREIGN KEY ("loaded_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_source_ck" CHECK ("entry_log"."source" in ('normal','manual'));