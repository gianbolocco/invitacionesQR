CREATE TABLE "provider" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"doc" text NOT NULL,
	"name" text NOT NULL,
	"trade_id" uuid,
	"insurance_company" text,
	"insurance_policy" text,
	"insurance_expires_on" date,
	"insurance_source" text,
	"insurance_updated_by" uuid,
	"insurance_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_doc_ck" CHECK ("provider"."doc" ~ '^[0-9A-Z]+$'),
	CONSTRAINT "provider_insurance_company_ck" CHECK (char_length("provider"."insurance_company") <= 80),
	CONSTRAINT "provider_insurance_policy_ck" CHECK (char_length("provider"."insurance_policy") <= 40),
	CONSTRAINT "provider_insurance_all_or_none_ck" CHECK (("provider"."insurance_company" is null) = ("provider"."insurance_policy" is null)
    and ("provider"."insurance_policy" is null) = ("provider"."insurance_expires_on" is null)),
	CONSTRAINT "provider_insurance_source_ck" CHECK ("provider"."insurance_source" in ('garita','link'))
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"insurance_company" text NOT NULL,
	"insurance_policy" text NOT NULL,
	"insurance_expires_on" date NOT NULL,
	"insurance_updated_by" uuid,
	"insurance_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_plate_ck" CHECK ("vehicle"."plate" ~ '^[0-9A-Z]+$'),
	CONSTRAINT "vehicle_insurance_company_ck" CHECK (char_length("vehicle"."insurance_company") <= 80),
	CONSTRAINT "vehicle_insurance_policy_ck" CHECK (char_length("vehicle"."insurance_policy") <= 40)
);
--> statement-breakpoint
ALTER TABLE "entry_log" ADD COLUMN "provider_insurance" text;--> statement-breakpoint
ALTER TABLE "entry_log" ADD COLUMN "vehicle_insurance" text;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "vehicle_insurance_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "vehicle_insurance_override" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "provider" ADD CONSTRAINT "provider_neighborhood_id_neighborhood_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhood"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider" ADD CONSTRAINT "provider_trade_id_trade_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider" ADD CONSTRAINT "provider_insurance_updated_by_person_id_fk" FOREIGN KEY ("insurance_updated_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_neighborhood_id_neighborhood_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhood"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_insurance_updated_by_person_id_fk" FOREIGN KEY ("insurance_updated_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_doc_uq" ON "provider" USING btree ("neighborhood_id","doc");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_plate_uq" ON "vehicle" USING btree ("neighborhood_id","plate");--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_provider_insurance_ck" CHECK ("entry_log"."provider_insurance" in ('no_aplica','sin_cargar','vencido','por_vencer','vigente'));--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_vehicle_insurance_ck" CHECK ("entry_log"."vehicle_insurance" in ('no_aplica','sin_cargar','vencido','por_vencer','vigente'));