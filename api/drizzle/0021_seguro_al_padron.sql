-- El seguro del proveedor pasa de la invitación al padrón, por DNI normalizado.
-- Si un DNI tiene varias, gana el que vence más tarde (y a igual vencimiento,
-- la invitación más nueva): nombre y rubro salen de esa misma invitación.
-- No se sabe quién lo cargó: queda como 'link'. Las invitaciones sin DNI
-- pierden el seguro, y la garita lo vuelve a pedir.
INSERT INTO "provider" ("neighborhood_id", "doc", "name", "trade_id",
  "insurance_company", "insurance_policy", "insurance_expires_on", "insurance_source", "insurance_updated_at")
SELECT DISTINCT ON (u."neighborhood_id", d.doc)
  u."neighborhood_id", d.doc, i."guest_name", i."trade_id",
  i."insurance_company", i."insurance_policy", i."insurance_expires_on", 'link', i."created_at"
FROM "invitation" i
JOIN "unit" u ON u."id" = i."unit_id"
CROSS JOIN LATERAL (SELECT upper(regexp_replace(i."guest_doc", '[^0-9A-Za-z]', '', 'g')) AS doc) d
WHERE i."insurance_policy" IS NOT NULL AND d.doc <> ''
ORDER BY u."neighborhood_id", d.doc, i."insurance_expires_on" DESC, i."created_at" DESC
ON CONFLICT ("neighborhood_id", "doc") DO NOTHING;--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_insurance_company_ck";--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_insurance_policy_ck";--> statement-breakpoint
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_insurance_all_or_none_ck";--> statement-breakpoint
ALTER TABLE "invitation" DROP COLUMN "insurance_company";--> statement-breakpoint
ALTER TABLE "invitation" DROP COLUMN "insurance_policy";--> statement-breakpoint
ALTER TABLE "invitation" DROP COLUMN "insurance_expires_on";