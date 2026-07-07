import type { SzybkoInternalApi } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { contextBridge } from 'electron';
import { on } from './api/ipc';
import { createItemApi } from './api/item';
import { createLayoutApi } from './api/layout';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';
import { createPluginManagementApi } from './api/plugin-management';
import { createSearchApi } from './api/search';
import { createShortcutApi } from './api/shortcut';
import { createThemeApi } from './api/theme';
import { createWindowApi } from './api/window';

const { onRuntimeStateChanged } = createPluginLifecycleApi();

const internalApi = {
    ...createSearchApi(),
    ...createItemApi(),
    ...createWindowApi(),
    ...createThemeApi(),
    ...createLayoutApi(),
    ...createShortcutApi(),
    ...createPluginManagementApi(),
    onRuntimeStateChanged,
    onFloatingSlotUpdate: on(IPC.FLOATING_SLOT_UPDATE),
} satisfies SzybkoInternalApi;

contextBridge.exposeInMainWorld('szybkoInternal', internalApi);
