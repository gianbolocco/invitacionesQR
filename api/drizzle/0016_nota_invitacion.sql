ALTER TABLE "invitation" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_note_ck" CHECK (char_length("invitation"."note") <= 140);