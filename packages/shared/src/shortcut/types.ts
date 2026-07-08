export type ShortcutPlatform = 'darwin' | 'win32' | 'linux';

export type ShortcutScope
    = | 'system'
        | 'main-window'
        | 'plugin-view'
        | 'menu'
        | 'renderer-document';

export interface ShortcutModifiers {
    ctrl?: boolean;
    meta?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export interface ShortcutBinding {
    id: string;
    key: string;
    modifiers: ShortcutModifiers;
    platforms?: ShortcutPlatform[];
    accelerator?: string;
    preventDefault?: boolean;
}

export interface ShortcutActionDef {
    actionId: string;
    scope: ShortcutScope;
    description: string;
    bindings: ShortcutBinding[];
}
