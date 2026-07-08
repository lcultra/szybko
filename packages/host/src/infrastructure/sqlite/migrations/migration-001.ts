export const name = '001_create_initial_tables';

export const sql = `
CREATE TABLE plugin_installation (
  plugin_id TEXT PRIMARY KEY CHECK (length(trim(plugin_id)) > 0),
  source TEXT NOT NULL CHECK (source IN ('built-in', 'local-dev', 'user-installed')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  install_path TEXT NOT NULL CHECK (length(trim(install_path)) > 0),
  version TEXT,
  manifest_hash TEXT NOT NULL DEFAULT '',
  manifest_indexed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plugin_installation_enabled ON plugin_installation(enabled, source);

CREATE TABLE manifest_feature_snapshot (
  plugin_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  feature_order INTEGER NOT NULL CHECK (feature_order >= 0),
  feature_json TEXT NOT NULL CHECK (json_valid(feature_json)),
  feature_hash TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, code),
  UNIQUE (plugin_id, feature_order),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);

CREATE TABLE feature_override (
  plugin_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'removed')),
  feature_json TEXT,
  feature_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, code),
  CHECK ((state = 'active' AND feature_json IS NOT NULL AND json_valid(feature_json) AND feature_hash IS NOT NULL) OR (state = 'removed' AND feature_json IS NULL AND feature_hash IS NULL)),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feature_override_plugin_state ON feature_override(plugin_id, state);

CREATE TABLE effective_feature (
  plugin_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) > 0),
  source TEXT NOT NULL CHECK (source IN ('manifest', 'dynamic')),
  feature_order INTEGER NOT NULL CHECK (feature_order >= 0),
  feature_json TEXT NOT NULL CHECK (json_valid(feature_json)),
  feature_hash TEXT NOT NULL,
  rebuilt_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, code),
  UNIQUE (plugin_id, feature_order),
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_effective_feature_plugin_source ON effective_feature(plugin_id, source);

CREATE TABLE command_trigger (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  trigger_index   INTEGER NOT NULL CHECK (trigger_index >= 0),
  type            TEXT NOT NULL CHECK (type IN ('text','regex','over','img','files','window')),
  label           TEXT,
  matcher_json    TEXT NOT NULL CHECK (json_valid(matcher_json)),
  score_base      INTEGER NOT NULL DEFAULT 90,
  rebuilt_at      INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, feature_code, cmd_key)
);
CREATE INDEX IF NOT EXISTS idx_ct_type ON command_trigger(type);

CREATE TABLE command_trigger_search (
  plugin_id       TEXT NOT NULL,
  feature_code    TEXT NOT NULL,
  cmd_key         TEXT NOT NULL,
  search_text     TEXT NOT NULL CHECK (length(trim(search_text)) > 0),
  source          TEXT NOT NULL CHECK (source IN ('cmd', 'alias')),
  match_level     INTEGER NOT NULL CHECK (match_level IN (1, 2, 3)),
  alias_id        INTEGER,
  PRIMARY KEY (plugin_id, feature_code, cmd_key, search_text)
);
CREATE INDEX IF NOT EXISTS idx_cts_lookup ON command_trigger_search(search_text);

CREATE TABLE command_alias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id         TEXT NOT NULL,
  feature_code      TEXT NOT NULL,
  alias_key         TEXT NOT NULL,
  alias_normalized  TEXT NOT NULL,
  target_cmd_key    TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'removed')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_active_unique ON command_alias(plugin_id, feature_code, alias_normalized) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS idx_ca_lookup ON command_alias(plugin_id, feature_code);

CREATE TABLE command_projection_meta (
  plugin_id TEXT PRIMARY KEY,
  manifest_hash TEXT NOT NULL,
  override_fingerprint TEXT NOT NULL,
  index_version INTEGER NOT NULL,
  rebuilt_at INTEGER NOT NULL,
  FOREIGN KEY (plugin_id) REFERENCES plugin_installation(plugin_id) ON DELETE CASCADE
);
`;
