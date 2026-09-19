DROP INDEX "person_email_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_uq" ON "person" USING btree ("email");