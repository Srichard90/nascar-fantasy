-- ============================================================
--  MIGRATION: Associate drivers with seasons
--  Run this in Supabase > SQL Editor if you already have data.
--  If you are starting fresh, run supabase_schema.sql instead.
-- ============================================================

-- Step 1: Add season_id column (nullable first so existing rows don't fail)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS season_id INT REFERENCES seasons(season_id);

-- Step 2: Assign all existing drivers to the current active season
UPDATE drivers
SET season_id = (SELECT season_id FROM seasons WHERE is_active = true LIMIT 1)
WHERE season_id IS NULL;

-- Step 3: Make season_id required going forward
ALTER TABLE drivers ALTER COLUMN season_id SET NOT NULL;

-- Step 4: Drop the old global unique constraint and add a per-season one
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_driver_name_key;
ALTER TABLE drivers ADD CONSTRAINT IF NOT EXISTS drivers_season_driver_unique UNIQUE (season_id, driver_name);

-- Done! Existing drivers are now tied to your active season.
-- Next season, go to Admin > Drivers to add a new driver list for that season.
