ALTER TABLE "invitation" DROP CONSTRAINT "invitation_kind_ck";--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "delivery_app" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "overstay_minutes_delivery" smallint DEFAULT 30;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_delivery_ck" CHECK (case when "invitation"."kind" = 'delivery' then "invitation"."delivery_app" is not null and "invitation"."expires_at" is not null else "invitation"."delivery_app" is null and "invitation"."expires_at" is null end);--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_delivery_app_ck" CHECK ("invitation"."delivery_app" in ('pedidosya','rappi','mercadolibre','otro'));--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_kind_ck" CHECK ("invitation"."kind" in ('visita','frecuente','proveedor','delivery'));--> statement-breakpoint
ALTER TABLE "neighborhood" ADD CONSTRAINT "neighborhood_overstay_delivery_ck" CHECK ("neighborhood"."overstay_minutes_delivery" between 5 and 240);