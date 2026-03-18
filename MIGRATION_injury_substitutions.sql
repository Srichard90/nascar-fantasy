-- ============================================================
--  MIGRATION: Driver injury substitutions
--  Run in Supabase > SQL Editor
-- ============================================================

-- Step 1: New table to track substitutions
CREATE TABLE IF NOT EXISTS driver_substitutions (
  sub_id             SERIAL PRIMARY KEY,
  season_id          INT NOT NULL REFERENCES seasons(season_id),
  player_id          INT NOT NULL REFERENCES players(player_id),
  original_driver_id INT NOT NULL REFERENCES drivers(driver_id),
  sub_driver_id      INT NOT NULL REFERENCES drivers(driver_id),
  start_week         INT NOT NULL,
  end_week           INT,   -- NULL = substitution still active
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE driver_substitutions DISABLE ROW LEVEL SECURITY;

-- Step 2: Update the scoring trigger to use the substitute driver
-- when one is active for that player during that race week.
CREATE OR REPLACE FUNCTION update_scores_after_result()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id INT;
BEGIN
  SELECT season_id INTO v_season_id FROM races WHERE race_id = NEW.race_id;

  INSERT INTO player_weekly_scores
    (season_id, race_id, player_id, week_number, total_points, drivers_scored, last_updated)
  SELECT
    r.season_id,
    r.race_id,
    dp.player_id,
    r.week_number,
    COALESCE(SUM(rr.finish_position), 0),
    COUNT(rr.race_result_id),
    NOW()
  FROM races r
  JOIN draft_sessions ds  ON ds.season_id        = r.season_id
  JOIN draft_picks    dp  ON dp.draft_session_id  = ds.draft_session_id
  -- Resolve effective driver: sub if active, otherwise the drafted driver
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (SELECT sub_driver_id
       FROM driver_substitutions
       WHERE player_id  = dp.player_id
         AND season_id  = r.season_id
         AND start_week <= r.week_number
         AND (end_week IS NULL OR end_week >= r.week_number)
       LIMIT 1),
      dp.driver_id
    ) AS driver_id
  ) eff ON true
  LEFT JOIN race_results rr ON rr.race_id   = r.race_id
                           AND rr.driver_id  = eff.driver_id
  WHERE r.race_id = NEW.race_id
  GROUP BY r.season_id, r.race_id, dp.player_id, r.week_number
  ON CONFLICT (race_id, player_id) DO UPDATE SET
    total_points   = EXCLUDED.total_points,
    drivers_scored = EXCLUDED.drivers_scored,
    last_updated   = NOW();

  INSERT INTO player_standings
    (season_id, player_id, total_points, weeks_scored, best_week, last_updated)
  SELECT
    v_season_id,
    pws.player_id,
    SUM(pws.total_points),
    COUNT(*),
    MIN(CASE WHEN pws.drivers_scored > 0 THEN pws.total_points END),
    NOW()
  FROM player_weekly_scores pws
  WHERE pws.season_id     = v_season_id
    AND pws.drivers_scored > 0
  GROUP BY pws.player_id
  ON CONFLICT (season_id, player_id) DO UPDATE SET
    total_points = EXCLUDED.total_points,
    weeks_scored = EXCLUDED.weeks_scored,
    best_week    = EXCLUDED.best_week,
    last_updated = NOW();

  RETURN NEW;
END;
$$;

-- Step 3: Re-trigger all scores for the active season so existing data
-- picks up the new trigger logic (safe to run, no data is deleted)
UPDATE race_results
SET finish_position = finish_position
WHERE race_id IN (
  SELECT race_id FROM races
  WHERE season_id = (SELECT season_id FROM seasons WHERE is_active = true LIMIT 1)
);
