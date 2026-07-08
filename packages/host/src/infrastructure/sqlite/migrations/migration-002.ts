export const name = '002_create_item_tables';

export const sql = `
-- pinned_item：通用固定表，不绑定 provider 内部结构
CREATE TABLE pinned_item (
  item_id       TEXT PRIMARY KEY,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  pinned_at     INTEGER NOT NULL
);

-- usage_event：通用使用记录表，不绑定 provider 内部结构
CREATE TABLE usage_event (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         TEXT NOT NULL,
  query           TEXT,
  selected_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_event_lookup ON usage_event(item_id, selected_at DESC);
`;
