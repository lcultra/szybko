import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    source: text('source', { enum: ['feature_cmd', 'alias'] }).notNull(),
    type: text('type', { enum: ['text', 'regex', 'over', 'img', 'files', 'window'] }).notNull(),
    label: text('label'),
    matcherJson: text('matcher_json').notNull(),
    normalizedKey: text('normalized_key'),
    aliasId: integer('alias_id'),
    targetCmdKey: text('target_cmd_key'),
    scoreBase: integer('score_base').notNull().default(90),
    rebuiltAt: integer('rebuilt_at').notNull(),
}, table => [
    primaryKey({ columns: [table.pluginId, table.featureCode, table.source, table.cmdKey] }),
    index('idx_command_trigger_text_lookup').on(table.normalizedKey, table.pluginId, table.featureCode, table.source),
    index('idx_command_trigger_type').on(table.type),
    index('idx_command_trigger_target_cmd').on(table.pluginId, table.featureCode, table.targetCmdKey),
]);

export const commandProjectionMeta = sqliteTable('command_projection_meta', {
    pluginId: text('plugin_id').primaryKey().references(() => pluginInstallation.pluginId, { onDelete: 'cascade' }),
    manifestHash: text('manifest_hash').notNull(),
    overrideFingerprint: text('override_fingerprint').notNull(),
    indexVersion: integer('index_version').notNull(),
    rebuiltAt: integer('rebuilt_at').notNull(),
});
