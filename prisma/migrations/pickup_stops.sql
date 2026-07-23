ALTER TABLE "zippycar"."rides"
  ADD COLUMN IF NOT EXISTS "pickupStops" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "zippycar"."rides"
  ADD COLUMN IF NOT EXISTS "corridorId" TEXT;

ALTER TABLE "zippycar"."bookings"
  ADD COLUMN IF NOT EXISTS "riderFromCity" TEXT NOT NULL DEFAULT '';

ALTER TABLE "zippycar"."bookings"
  ADD COLUMN IF NOT EXISTS "riderToCity" TEXT NOT NULL DEFAULT '';
