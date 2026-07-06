import { desc, eq } from 'drizzle-orm';
import { foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pluginInstallation = sqliteTable('plugin_installation', {
    pluginId: text('plugin_id').primaryKey(),
    source: text('source', { enum: ['built-in', 'local-dev', 'user-installed'] }).notNull(),
    enabled: integer('enabled').notNull().default(1),
    installPath: text('install_path').notNull(),
    version: text('version'),
    manifestHash: text('manifest_hash').notNull().default(''),
    manifestIndexedAt: integer('manifest_indexed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
}, table => [
    index('idx_plugin_installation_enabled').on(table.enabled, table.source),
]);

export const manifestFeatureSnapshot = sqliteTable('manifest_feature_snapshot', {
    pluginId: text('plugin_id').notNull().references(() => pluginInstallation.pluginId, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    featureOrder: integer('feature_order').notNull(),
    featureJson: text('feature_json').notNull(),
    featureHash: text('feature_hash').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    indexedAt: integer('indexed_at').notNull(),
}, table => [
    primaryKey({ columns: [table.pluginId, table.code] }),
    uniqueIndex('uidx_manifest_feature_order').on(table.pluginId, table.featureOrder),
]);

export const featureOverride = sqliteTable('feature_override', {
    pluginId: text('plugin_id').notNull().references(() => pluginInstallation.pluginId, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    state: text('state', { enum: ['active', 'removed'] }).notNull(),
    featureJson: text('feature_json'),
    featureHash: text('feature_hash'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
}, table => [
    primaryKey({ columns: [table.pluginId, table.code] }),
    index('idx_feature_override_plugin_state').on(table.pluginId, table.state),
]);

export const effectiveFeature = sqliteTable('effective_feature', {
    pluginId: text('plugin_id').notNull().references(() => pluginInstallation.pluginId, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    source: text('source', { enum: ['manifest', 'dynamic'] }).notNull(),
    featureOrder: integer('feature_order').notNull(),
    featureJson: text('feature_json').notNull(),
    featureHash: text('feature_hash').notNull(),
    rebuiltAt: integer('rebuilt_at').notNull(),
}, table => [
    primaryKey({ columns: [table.pluginId, table.code] }),
    uniqueIndex('uidx_effective_feature_order').on(table.pluginId, table.featureOrder),
    index('idx_effective_feature_plugin_source').on(table.pluginId, table.source),
]);

export const commandTrigger = sqliteTable('command_trigger', {
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    triggerIndex: integer('trigger_index').notNull(),
    type: text('type', { enum: ['text', 'regex', 'over', 'img', 'files', 'window'] }).notNull(),
    label: text('label'),
    matcherJson: text('matcher_json').notNull(),
    scoreBase: integer('score_base').notNull().default(90),
    rebuiltAt: integer('rebuilt_at').notNull(),
}, table => ({
    pk: primaryKey({ columns: [table.pluginId, table.featureCode, table.cmdKey] }),
    typeIdx: index('idx_ct_type').on(table.type),
}));

export const commandProjectionMeta = sqliteTable('command_projection_meta', {
    pluginId: text('plugin_id').primaryKey().references(() => pluginInstallation.pluginId, { onDelete: 'cascade' }),
    manifestHash: text('manifest_hash').notNull(),
    overrideFingerprint: text('override_fingerprint').notNull(),
    indexVersion: integer('index_version').notNull(),
    rebuiltAt: integer('rebuilt_at').notNull(),
});

export const commandTriggerSearch = sqliteTable('command_trigger_search', {
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    searchText: text('search_text').notNull(),
    source: text('source', { enum: ['cmd', 'alias'] }).notNull(),
    matchLevel: integer('match_level').notNull(),
    aliasId: integer('alias_id'),
}, table => ({
    pk: primaryKey({ columns: [table.pluginId, table.featureCode, table.cmdKey, table.searchText] }),
    lookupIdx: index('idx_cts_lookup').on(table.searchText),
}));

export const commandAlias = sqliteTable('command_alias', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    aliasKey: text('alias_key').notNull(),
    aliasNormalized: text('alias_normalized').notNull(),
    targetCmdKey: text('target_cmd_key').notNull(),
    state: text('state', { enum: ['active', 'removed'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
}, table => ({
    pluginFk: foreignKey({ columns: [table.pluginId], foreignColumns: [pluginInstallation.pluginId] }).onDelete('cascade'),
    activeUnique: uniqueIndex('idx_ca_active_unique').on(table.pluginId, table.featureCode, table.aliasNormalized).where(eq(table.state, 'active')),
    lookupIdx: index('idx_ca_lookup').on(table.pluginId, table.featureCode),
}));

export const pinnedTrigger = sqliteTable('pinned_trigger', {
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    pinnedAt: integer('pinned_at').notNull(),
}, table => ({
    pk: primaryKey({ columns: [table.pluginId, table.featureCode, table.cmdKey] }),
    pluginFk: foreignKey({ columns: [table.pluginId], foreignColumns: [pluginInstallation.pluginId] }).onDelete('cascade'),
}));

export const usageHistory = sqliteTable('usage_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pluginId: text('plugin_id').notNull(),
    featureCode: text('feature_code').notNull(),
    cmdKey: text('cmd_key').notNull(),
    query: text('query'),
    matchLevel: integer('match_level'),
    selectedAt: integer('selected_at').notNull(),
}, table => ({
    pluginFk: foreignKey({ columns: [table.pluginId], foreignColumns: [pluginInstallation.pluginId] }).onDelete('cascade'),
    lookupIdx: index('idx_uh_lookup').on(table.pluginId, table.featureCode, table.cmdKey, desc(table.selectedAt)),
}));

// ── 通用 item 表（替换 pinned_trigger / usage_history，不绑定 plugin 结构） ──

export const pinnedItem = sqliteTable('pinned_item', {
    itemId: text('item_id').primaryKey(),
    sortOrder: integer('sort_order').notNull().default(0),
    pinnedAt: integer('pinned_at').notNull(),
});

export const usageEvent = sqliteTable('usage_event', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id').notNull(),
    query: text('query'),
    selectedAt: integer('selected_at').notNull(),
}, table => ({
    lookupIdx: index('idx_usage_event_lookup').on(table.itemId, desc(table.selectedAt)),
}));
