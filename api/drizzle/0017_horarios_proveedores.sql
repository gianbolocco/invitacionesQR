CREATE TABLE "trade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "trade_id" uuid;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "provider_windows" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trade" ADD CONSTRAINT "trade_neighborhood_id_neighborhood_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhood"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trade_name_uq" ON "trade" USING btree ("neighborhood_id",lower("name"));--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_trade_id_trade_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_trade_ck" CHECK ("invitation"."trade_id" is null or "invitation"."kind" = 'proveedor'
    or ("invitation"."kind" = 'frecuente' and "invitation"."frequent_as" = 'proveedor'));