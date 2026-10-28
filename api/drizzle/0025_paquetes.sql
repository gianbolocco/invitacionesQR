CREATE TABLE "package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notify_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "package_note_ck" CHECK ("package"."note" is null or char_length("package"."note") between 1 and 80),
	CONSTRAINT "package_estado_ck" CHECK ("package"."notified_at" is null or "package"."canceled_at" is null)
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "packages_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "packages_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "package" ADD CONSTRAINT "package_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package" ADD CONSTRAINT "package_created_by_person_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_unit_idx" ON "package" USING btree ("unit_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_uq" ON "push_subscription" USING btree ("endpoint");