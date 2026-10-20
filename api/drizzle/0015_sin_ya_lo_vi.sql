ALTER TABLE "entry_log" DROP CONSTRAINT "entry_log_overstay_seen_by_person_id_fk";
--> statement-breakpoint
ALTER TABLE "entry_log" DROP COLUMN "overstay_seen_at";--> statement-breakpoint
ALTER TABLE "entry_log" DROP COLUMN "overstay_seen_by";