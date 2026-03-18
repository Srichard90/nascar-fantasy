-- ============================================================
--  NASCAR FANTASY LEAGUE — Supabase / PostgreSQL Schema
--  Paste this entire file into Supabase > SQL Editor > Run
--  Scoring: Lower points = better (finish position = points)
-- ============================================================

-- ============================================================
--  SECTION 1: TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS seasons (
  season_id   SERIAL PRIMARY KEY,
  season_year INT          NOT NULL UNIQUE,
  season_name VARCHAR(100) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drivers (
  driver_id   SERIAL PRIMARY KEY,
  driver_name VARCHAR(100) NOT NULL UNIQUE,
  car_number  VARCHAR(10),
  team        VARCHAR(150),
  is_active   BOOLEAN      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS players (
  player_id      SERIAL PRIMARY KEY,
  season_id      INT          NOT NULL REFERENCES seasons(season_id),
  player_name    VARCHAR(100) NOT NULL,
  email          VARCHAR(255),
  draft_position INT          NOT NULL,
  UNIQUE(season_id, player_name),
  UNIQUE(season_id, draft_position)
);

CREATE TABLE IF NOT EXISTS draft_sessions (
  draft_session_id SERIAL PRIMARY KEY,
  season_id        INT     NOT NULL UNIQUE REFERENCES seasons(season_id),
  total_drivers    INT     NOT NULL DEFAULT 20,
  total_players    INT     NOT NULL,
  total_rounds     INT     NOT NULL,
  current_pick_num INT     NOT NULL DEFAULT 1,
  is_complete      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS draft_picks (
  draft_pick_id    SERIAL PRIMARY KEY,
  draft_session_id INT         NOT NULL REFERENCES draft_sessions(draft_session_id),
  player_id        INT         NOT NULL REFERENCES players(player_id),
  driver_id        INT         NOT NULL REFERENCES drivers(driver_id),
  round_number     INT         NOT NULL,
  pick_number      INT         NOT NULL,
  picked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draft_session_id, driver_id),
  UNIQUE(draft_session_id, player_id, round_number),
  UNIQUE(draft_session_id, pick_number)
);

CREATE TABLE IF NOT EXISTS races (
  race_id     SERIAL PRIMARY KEY,
  season_id   INT          NOT NULL REFERENCES seasons(season_id),
  week_number INT          NOT NULL,
  race_name   VARCHAR(200) NOT NULL,
  track_name  VARCHAR(200),
  race_date   DATE,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(season_id, week_number)
);

CREATE TABLE IF NOT EXISTS race_results (
  race_result_id  SERIAL PRIMARY KEY,
  race_id         INT     NOT NULL REFERENCES races(race_id),
  driver_id       INT     NOT NULL REFERENCES drivers(driver_id),
  finish_position INT     NOT NULL CHECK(finish_position >= 1),
  start_position  INT,
  laps_completed  INT,
  dnf             BOOLEAN NOT NULL DEFAULT false,
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(race_id, driver_id),
  UNIQUE(race_id, finish_position)
);

CREATE TABLE IF NOT EXISTS player_weekly_scores (
  weekly_score_id SERIAL PRIMARY KEY,
  season_id       INT     NOT NULL REFERENCES seasons(season_id),
  race_id         INT     NOT NULL REFERENCES races(race_id),
  player_id       INT     NOT NULL REFERENCES players(player_id),
  week_number     INT     NOT NULL,
  total_points    INT     NOT NULL DEFAULT 0,
  drivers_scored  INT     NOT NULL DEFAULT 0,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(race_id, player_id)
);

CREATE TABLE IF NOT EXISTS player_standings (
  standing_id  SERIAL PRIMARY KEY,
  season_id    INT     NOT NULL REFERENCES seasons(season_id),
  player_id    INT     NOT NULL REFERENCES players(player_id),
  total_points INT     NOT NULL DEFAULT 0,
  weeks_scored INT     NOT NULL DEFAULT 0,
  best_week    INT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, player_id)
);


-- ============================================================
--  SECTION 2: DISABLE ROW LEVEL SECURITY
--  Safe for a private friend-group league.
-- ============================================================

ALTER TABLE seasons              DISABLE ROW LEVEL SECURITY;
ALTER TABLE drivers              DISABLE ROW LEVEL SECURITY;
ALTER TABLE players              DISABLE ROW LEVEL SECURITY;
ALTER TABLE draft_sessions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks          DISABLE ROW LEVEL SECURITY;
ALTER TABLE races                DISABLE ROW LEVEL SECURITY;
ALTER TABLE race_results         DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_weekly_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_standings     DISABLE ROW LEVEL SECURITY;


-- ============================================================
--  SECTION 3: ENABLE REAL-TIME
--  Required for the live draft room to work.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE draft_sessions;


-- ============================================================
--  SECTION 4: HELPER FUNCTION — Snake Draft Pick Owner
-- ============================================================

CREATE OR REPLACE FUNCTION get_pick_owner(
  p_draft_session_id INT,
  p_pick_number      INT
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_players  INT;
  v_season_id      INT;
  v_round_number   INT;
  v_pos_in_round   INT;
  v_draft_position INT;
  v_player_id      INT;
BEGIN
  SELECT total_players, season_id
    INTO v_total_players, v_season_id
  FROM draft_sessions
  WHERE draft_session_id = p_draft_session_id;

  IF v_total_players IS NULL THEN RETURN NULL; END IF;

  v_round_number  := ((p_pick_number - 1) / v_total_players) + 1;
  v_pos_in_round  := ((p_pick_number - 1) % v_total_players) + 1;

  IF v_round_number % 2 = 1 THEN
    v_draft_position := v_pos_in_round;
  ELSE
    v_draft_position := v_total_players - v_pos_in_round + 1;
  END IF;

  SELECT player_id INTO v_player_id
  FROM players
  WHERE season_id = v_season_id
    AND draft_position = v_draft_position;

  RETURN v_player_id;
END;
$$;


-- ============================================================
--  SECTION 5: RPC FUNCTIONS (called from the web app)
-- ============================================================

CREATE OR REPLACE FUNCTION start_draft_session()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_season_id     INT;
  v_total_players INT;
  v_total_rounds  INT;
BEGIN
  SELECT season_id INTO v_season_id
  FROM seasons WHERE is_active = true LIMIT 1;

  IF v_season_id IS NULL THEN
    RETURN '{"success":false,"error":"No active season found"}'::JSON;
  END IF;

  IF EXISTS (SELECT 1 FROM draft_sessions WHERE season_id = v_season_id) THEN
    RETURN '{"success":false,"error":"Draft session already exists"}'::JSON;
  END IF;

  SELECT COUNT(*) INTO v_total_players
  FROM players WHERE season_id = v_season_id;

  IF v_total_players < 2 THEN
    RETURN '{"success":false,"error":"Need at least 2 players"}'::JSON;
  END IF;

  IF 20 % v_total_players != 0 THEN
    RETURN '{"success":false,"error":"Player count must divide evenly into 20 (use 4 or 5 players)"}'::JSON;
  END IF;

  v_total_rounds := 20 / v_total_players;

  INSERT INTO draft_sessions
    (season_id, total_drivers, total_players, total_rounds, current_pick_num, is_complete)
  VALUES
    (v_season_id, 20, v_total_players, v_total_rounds, 1, false);

  INSERT INTO player_standings (season_id, player_id, total_points, weeks_scored)
  SELECT v_season_id, player_id, 0, 0
  FROM players WHERE season_id = v_season_id
  ON CONFLICT (season_id, player_id) DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'total_players', v_total_players,
    'total_rounds', v_total_rounds
  );
END;
$$;


CREATE OR REPLACE FUNCTION make_draft_pick(
  p_player_id INT,
  p_driver_id INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id      INT;
  v_season_id       INT;
  v_total_players   INT;
  v_total_drivers   INT;
  v_current_pick    INT;
  v_is_complete     BOOLEAN;
  v_expected_player INT;
  v_round_number    INT;
BEGIN
  SELECT season_id INTO v_season_id
  FROM seasons WHERE is_active = true LIMIT 1;

  SELECT draft_session_id, total_players, total_drivers, current_pick_num, is_complete
    INTO v_session_id, v_total_players, v_total_drivers, v_current_pick, v_is_complete
  FROM draft_sessions WHERE season_id = v_season_id;

  IF v_session_id IS NULL THEN
    RETURN '{"success":false,"error":"No active draft session"}'::JSON;
  END IF;

  IF v_is_complete OR v_current_pick > v_total_drivers THEN
    RETURN '{"success":false,"error":"Draft is already complete"}'::JSON;
  END IF;

  v_expected_player := get_pick_owner(v_session_id, v_current_pick);

  IF v_expected_player IS DISTINCT FROM p_player_id THEN
    RETURN '{"success":false,"error":"It is not your turn to pick"}'::JSON;
  END IF;

  IF EXISTS (
    SELECT 1 FROM draft_picks
    WHERE draft_session_id = v_session_id AND driver_id = p_driver_id
  ) THEN
    RETURN '{"success":false,"error":"That driver has already been drafted"}'::JSON;
  END IF;

  v_round_number := ((v_current_pick - 1) / v_total_players) + 1;

  INSERT INTO draft_picks
    (draft_session_id, player_id, driver_id, round_number, pick_number)
  VALUES
    (v_session_id, p_player_id, p_driver_id, v_round_number, v_current_pick);

  IF v_current_pick >= v_total_drivers THEN
    UPDATE draft_sessions
    SET current_pick_num = v_current_pick + 1, is_complete = true
    WHERE draft_session_id = v_session_id;
  ELSE
    UPDATE draft_sessions
    SET current_pick_num = v_current_pick + 1
    WHERE draft_session_id = v_session_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'pick_number', v_current_pick,
    'round_number', v_round_number
  );
END;
$$;


-- ============================================================
--  SECTION 6: TRIGGER — Auto-update scores after result entry
-- ============================================================

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
  JOIN draft_sessions  ds ON ds.season_id        = r.season_id
  JOIN draft_picks     dp ON dp.draft_session_id = ds.draft_session_id
  LEFT JOIN race_results rr ON rr.race_id   = r.race_id
                           AND rr.driver_id  = dp.driver_id
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

DROP TRIGGER IF EXISTS trg_update_scores ON race_results;

CREATE TRIGGER trg_update_scores
AFTER INSERT OR UPDATE ON race_results
FOR EACH ROW EXECUTE FUNCTION update_scores_after_result();


-- ============================================================
--  SECTION 7: SEED DATA — 20 NASCAR Cup Drivers
-- ============================================================

INSERT INTO drivers (driver_name, car_number, team) VALUES
  ('Kyle Larson',       '5',  'Hendrick Motorsports'),
  ('Chase Elliott',     '9',  'Hendrick Motorsports'),
  ('William Byron',     '24', 'Hendrick Motorsports'),
  ('Alex Bowman',       '48', 'Hendrick Motorsports'),
  ('Denny Hamlin',      '11', 'Joe Gibbs Racing'),
  ('Martin Truex Jr.',  '19', 'Joe Gibbs Racing'),
  ('Christopher Bell',  '20', 'Joe Gibbs Racing'),
  ('Ty Gibbs',          '54', 'Joe Gibbs Racing'),
  ('Tyler Reddick',     '45', '23XI Racing'),
  ('Bubba Wallace',     '23', '23XI Racing'),
  ('Ryan Blaney',       '12', 'Team Penske'),
  ('Joey Logano',       '22', 'Team Penske'),
  ('Austin Cindric',    '2',  'Team Penske'),
  ('Brad Keselowski',   '6',  'RFK Racing'),
  ('Chris Buescher',    '17', 'RFK Racing'),
  ('Ross Chastain',     '1',  'Trackhouse Racing'),
  ('Daniel Suarez',     '99', 'Trackhouse Racing'),
  ('Austin Dillon',     '3',  'Richard Childress Racing'),
  ('Kyle Busch',        '8',  'Richard Childress Racing'),
  ('Chase Briscoe',     '14', 'Stewart-Haas Racing')
ON CONFLICT (driver_name) DO NOTHING;
