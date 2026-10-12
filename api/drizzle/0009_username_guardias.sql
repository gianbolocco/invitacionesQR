ALTER TABLE "person" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "person" ADD COLUMN "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX "person_username_uq" ON "person" USING btree ("username");--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_login_identifier_ck" CHECK ((
    ("person"."role" = 'guard' and ("person"."email" is not null or "person"."username" is not null))
    or ("person"."role" <> 'guard' and "person"."email" is not null)
  ));--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_username_role_ck" CHECK ("person"."username" is null or "person"."role" = 'guard');--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_username_format_ck" CHECK ("person"."username" is null or "person"."username" ~ '^[a-z0-9][a-z0-9._-]{2,31}$');