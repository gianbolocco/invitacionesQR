CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"doc" text,
	"trade_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_kind_ck" CHECK ("contact"."kind" in ('visita','proveedor')),
	CONSTRAINT "contact_name_ck" CHECK (char_length("contact"."name") between 1 and 80),
	CONSTRAINT "contact_doc_ck" CHECK (char_length("contact"."doc") <= 40),
	CONSTRAINT "contact_trade_ck" CHECK ("contact"."trade_id" is null or "contact"."kind" = 'proveedor')
);
--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_trade_id_trade_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_created_by_person_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_unit_idx" ON "contact" USING btree ("unit_id","name");