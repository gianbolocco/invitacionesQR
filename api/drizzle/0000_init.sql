CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_token_purpose_ck" CHECK ("auth_token"."purpose" in ('invite','reset'))
);
--> statement-breakpoint
CREATE TABLE "entry_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"guard_id" uuid,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"guest_name" text NOT NULL,
	"guest_doc" text,
	"plate" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"kind" text NOT NULL,
	"guest_name" text NOT NULL,
	"guest_doc" text,
	"plate" text,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"weekdays" smallint[],
	"capacity" integer DEFAULT 1 NOT NULL,
	"token" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_kind_ck" CHECK ("invitation"."kind" in ('visita','frecuente','evento','proveedor')),
	CONSTRAINT "invitation_window_ck" CHECK ("invitation"."valid_to" >= "invitation"."valid_from"),
	CONSTRAINT "invitation_capacity_ck" CHECK ("invitation"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "neighborhood" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"password_hash" text,
	"google_sub" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_role_ck" CHECK ("person"."role" in ('resident','guard','admin')),
	CONSTRAINT "person_status_ck" CHECK ("person"."status" in ('invited','active','disabled'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_member" (
	"unit_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "unit_member_unit_id_person_id_pk" PRIMARY KEY("unit_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_neighborhood_id_neighborhood_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhood"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_person_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_log_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_log_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_log" ADD CONSTRAINT "entry_log_guard_id_person_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_person_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_neighborhood_id_neighborhood_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhood"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_member" ADD CONSTRAINT "unit_member_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_member" ADD CONSTRAINT "unit_member_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_neighborhood_id_neighborhood_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhood"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("neighborhood_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_token_hash_uq" ON "auth_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "entry_unit_idx" ON "entry_log" USING btree ("unit_id","entered_at");--> statement-breakpoint
CREATE INDEX "entry_invitation_idx" ON "entry_log" USING btree ("invitation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_uq" ON "invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitation_unit_idx" ON "invitation" USING btree ("unit_id","valid_to");--> statement-breakpoint
CREATE INDEX "invitation_creator_idx" ON "invitation" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_uq" ON "person" USING btree ("neighborhood_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "session_hash_uq" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_label_uq" ON "unit" USING btree ("neighborhood_id","label");