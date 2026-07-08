/** Branded type for plugin IDs */
export type PluginId = string & { __brand: 'PluginId' };

/** Branded type for runtime IDs */
export type RuntimeId = string & { __brand: 'RuntimeId' };

/** Branded type for search session IDs */
export type SearchSessionId = string & { __brand: 'SearchSessionId' };
