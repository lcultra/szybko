export const IPC = {
    // ── 搜索（新） ──
    SEARCH_QUERY: 'search:query',
    SEARCH_CANCEL: 'search:cancel',
    SEARCH_RESPONSE: 'search:response',

    // ── Item 交互（新） ──
    ITEM_PIN: 'item:pin',
    ITEM_REORDER: 'item:reorder',
    ITEM_CONTEXT_MENU: 'item:context-menu',
    ITEM_EXECUTE: 'item:execute',

    // ── 插件运行时 ──
    PLUGIN_EXEC: 'plugin:exec',
    PLUGIN_RUNTIME_STATE: 'plugin:runtime-state',
    HOST_SWITCH: 'host:switch',
    HOST_VIEW_ATTACHED: 'host:view-attached',
    HOST_VIEW_DETACHED: 'host:view-detached',
    WINDOW_RESIZE: 'window:resize',
    WINDOW_HIDE: 'window:hide',
    WINDOW_SHOW: 'window:show',
    THEME_CHANGED: 'theme:changed',
    THEME_GET: 'theme:get',
    PLUGIN_ENTER: 'plugin:enter',
    PLUGIN_HIDE: 'plugin:hide',
    PLUGIN_DESTROY: 'plugin:destroy',
    SHOW_PLUGIN_MENU: 'plugin:show-menu',
    PLUGIN_PIN: 'plugin:pin',
    PLUGIN_OUT: 'plugin:out',

    // ── 浮动窗口池（main → floating renderer） ──
    FLOATING_SLOT_UPDATE: 'floating:slot-update',

    FEATURE_SET: 'feature:set',
    FEATURE_GET: 'feature:get',
    FEATURE_REMOVE: 'feature:remove',

    // ── 插件安装管理 ──
    PLUGIN_SET_ENABLED: 'plugin:set-enabled',
    PLUGIN_UNINSTALL: 'plugin:uninstall',

    // ── 快捷键 ──
    SHORTCUT_GET_DEFS: 'shortcut:get-defs',

} as const;
