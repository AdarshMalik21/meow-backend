-- Migrate direction enum to fromCity/toCity before schema push
ALTER TABLE "zippycar"."rides" ADD COLUMN IF NOT EXISTS "fromCity" TEXT;
ALTER TABLE "zippycar"."rides" ADD COLUMN IF NOT EXISTS "toCity" TEXT;

UPDATE "zippycar"."rides"
SET "fromCity" = 'Moradabad', "toCity" = 'Delhi'
WHERE "direction"::text = 'MBD_TO_DEL' AND ("fromCity" IS NULL OR "toCity" IS NULL);

UPDATE "zippycar"."rides"
SET "fromCity" = 'Delhi', "toCity" = 'Moradabad'
WHERE "direction"::text = 'DEL_TO_MBD' AND ("fromCity" IS NULL OR "toCity" IS NULL);

UPDATE "zippycar"."rides"
SET "fromCity" = 'Unknown', "toCity" = 'Unknown'
WHERE "fromCity" IS NULL OR "toCity" IS NULL;

ALTER TABLE "zippycar"."rides" ALTER COLUMN "fromCity" SET NOT NULL;
ALTER TABLE "zippycar"."rides" ALTER COLUMN "toCity" SET NOT NULL;

ALTER TABLE "zippycar"."rides" DROP COLUMN IF EXISTS "direction";
DROP TYPE IF EXISTS "zippycar"."Direction";
