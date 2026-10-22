ALTER TABLE "invitation" ADD COLUMN "insurance_company" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "insurance_policy" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "insurance_expires_on" date;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "insurance_warn_days" smallint;--> statement-breakpoint
ALTER TABLE "trade" ADD COLUMN "requires_insurance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_insurance_company_ck" CHECK (char_length("invitation"."insurance_company") <= 80);--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_insurance_policy_ck" CHECK (char_length("invitation"."insurance_policy") <= 40);--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_insurance_all_or_none_ck" CHECK (("invitation"."insurance_company" is null) = ("invitation"."insurance_policy" is null)
    and ("invitation"."insurance_policy" is null) = ("invitation"."insurance_expires_on" is null));--> statement-breakpoint
ALTER TABLE "neighborhood" ADD CONSTRAINT "neighborhood_insurance_warn_ck" CHECK ("neighborhood"."insurance_warn_days" between 1 and 90);