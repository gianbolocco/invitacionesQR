ALTER TABLE "neighborhood" ADD COLUMN "map_image" "bytea";--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "map_image_mime" text;--> statement-breakpoint
ALTER TABLE "neighborhood" ADD COLUMN "map_image_updated_at" timestamp with time zone;