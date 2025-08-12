-- D1 schema for request analytics
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  date_key TEXT GENERATED ALWAYS AS (strftime('%Y-%m-%d', ts/1000, 'unixepoch')) VIRTUAL,
  hour_key TEXT GENERATED ALWAYS AS (strftime('%Y-%m-%d %H:00:00', ts/1000, 'unixepoch')) VIRTUAL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  referer TEXT,
  user_agent TEXT,
  country TEXT,
  colo TEXT,
  ip_hash TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_ts ON request_logs(ts);
CREATE INDEX IF NOT EXISTS idx_logs_hour ON request_logs(hour_key);
CREATE INDEX IF NOT EXISTS idx_logs_country ON request_logs(country);
CREATE INDEX IF NOT EXISTS idx_logs_path ON request_logs(path);
CREATE INDEX IF NOT EXISTS idx_logs_status ON request_logs(status);

-- Optional hourly aggregation table
-- Aggregation table with normalized keys (avoid expressions in primary key)
CREATE TABLE IF NOT EXISTS agg_metrics_hourly (
  hour_key TEXT NOT NULL,
  path_key TEXT NOT NULL DEFAULT '',
  country_key TEXT NOT NULL DEFAULT '',
  status_key INTEGER NOT NULL DEFAULT -1,
  pv INTEGER NOT NULL DEFAULT 0,
  uv INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour_key, path_key, country_key, status_key)
);

-- Trigger to maintain hourly PV aggregations
CREATE TRIGGER IF NOT EXISTS trg_after_insert_logs
AFTER INSERT ON request_logs
BEGIN
  -- site-wide
  INSERT INTO agg_metrics_hourly(hour_key, path_key, country_key, status_key, pv, uv)
  VALUES (NEW.hour_key, '', '', -1, 1, 0)
  ON CONFLICT(hour_key, path_key, country_key, status_key) DO UPDATE SET pv = pv + 1;

  -- by path
  INSERT INTO agg_metrics_hourly(hour_key, path_key, country_key, status_key, pv, uv)
  VALUES (NEW.hour_key, COALESCE(NEW.path, ''), '', -1, 1, 0)
  ON CONFLICT(hour_key, path_key, country_key, status_key) DO UPDATE SET pv = pv + 1;

  -- by country
  INSERT INTO agg_metrics_hourly(hour_key, path_key, country_key, status_key, pv, uv)
  VALUES (NEW.hour_key, '', COALESCE(NEW.country, ''), -1, 1, 0)
  ON CONFLICT(hour_key, path_key, country_key, status_key) DO UPDATE SET pv = pv + 1;

  -- by status
  INSERT INTO agg_metrics_hourly(hour_key, path_key, country_key, status_key, pv, uv)
  VALUES (NEW.hour_key, '', '', COALESCE(NEW.status, -1), 1, 0)
  ON CONFLICT(hour_key, path_key, country_key, status_key) DO UPDATE SET pv = pv + 1;
END;
