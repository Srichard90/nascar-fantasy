-- ============================================================
-- NASCAR Fantasy League — Supabase (PostgreSQL) Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

CREATE TABLE seasons (
  id          BIGSERIAL PRIMARY KEY,
  season_year INT  NOT NULL,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE players (
  id             BIGSERIAL PRIMARY KEY,
  season_id      BIGINT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name           TEXT   NOT NULL,
  draft_position INT    NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, draft_position)
);

CREATE TABLE drivers (
  id         BIGSERIAL PRIMARY KEY,
  season_id  BIGINT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name       TEXT   NOT NULL,
  car_number TEXT,
  team       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE draft_sessions (
  id           BIGSERIAL PRIMARY KEY,
  season_id    BIGINT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'completed')),
  total_rounds INT  NOT NULL,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE draft_picks (
  id               BIGSERIAL PRIMARY KEY,
  draft_session_id BIGINT NOT NULL REFERENCES draft_sessions(id) ON DELETE CASCADE,
  player_id        BIGINT NOT NULL REFERENCES players(id),
  driver_id        BIGINT NOT NULL REFERENCES drivers(id),
  round_number     INT    NOT NULL,
  pick_number      INT    NOT NULL,
  picked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draft_session_id, pick_number),
  UNIQUE(draft_session_id, driver_id)
);

CREATE TABLE races (
  id           BIGSERIAL PRIMARY KEY,
  season_id    BIGINT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week_number  INT    NOT NULL,
  race_name    TEXT   NOT NULL,
  track        TEXT,
  race_date    DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(season_id, week_number)
);

CREATE TABLE race_results (
  id              BIGSERIAL PRIMARY KEY,
  race_id         BIGINT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  driver_id       BIGINT NOT NULL REFERENCES drivers(id),
  finish_position INT    NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(race_id, driver_id),
  UNIQUE(race_id, finish_position)
);

-- Enable live updates in Draft Room
ALTER PUBLICATION supabase_realtime ADD TABLE draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE draft_sessions;

-- Row Level Security
ALTER TABLE seasons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE races          ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_results   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read seasons"           ON seasons        FOR SELECT USING (true);
CREATE POLICY "read players"           ON players        FOR SELECT USING (true);
CREATE POLICY "read drivers"           ON drivers        FOR SELECT USING (true);
CREATE POLICY "read draft_sessions"    ON draft_sessions FOR SELECT USING (true);
CREATE POLICY "read draft_picks"       ON draft_picks    FOR SELECT USING (true);
CREATE POLICY "read races"             ON races          FOR SELECT USING (true);
CREATE POLICY "read race_results"      ON race_results   FOR SELECT USING (true);
CREATE POLICY "write seasons"          ON seasons        FOR INSERT WITH CHECK (true);
CREATE POLICY "update seasons"         ON seasons        FOR UPDATE USING (true);
CREATE POLICY "write players"          ON players        FOR INSERT WITH CHECK (true);
CREATE POLICY "write drivers"          ON drivers        FOR INSERT WITH CHECK (true);
CREATE POLICY "write draft_sessions"   ON draft_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "update draft_sessions"  ON draft_sessions FOR UPDATE USING (true);
CREATE POLICY "write draft_picks"      ON draft_picks    FOR INSERT WITH CHECK (true);
CREATE POLICY "write races"            ON races          FOR INSERT WITH CHECK (true);
CREATE POLICY "update races"           ON races          FOR UPDATE USING (true);
CREATE POLICY "write race_results"     ON race_results   FOR INSERT WITH CHECK (true);
CREATE POLICY "update race_results"    ON race_results   FOR UPDATE USING (true);
CREATE POLICY "delete race_results"    ON race_results   FOR DELETE USING (true);
