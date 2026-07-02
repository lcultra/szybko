import type { SzybkoInternalApi, SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute.js';
import { createPluginLifecycleApi } from './api/plugin-lifecycle.js';
import { createSearchApi } from './api/search.js';
import { createThemeApi } from './api/theme.js';
import { createWindowApi } from './api/window.js';

const pluginApi = {
    ...createExecuteApi(),
    ...createPluginLifecycleApi(),
} satisfies SzybkoPluginApi;

const internalApi = {
    ...createSearchApi(),
    ...createWindowApi(),
    ...createThemeApi(),
} satisfies SzybkoInternalApi;

contextBridge.exposeInMainWorld('szybko', pluginApi);
contextBridge.exposeInMainWorld('szybkoInternal', internalApi);
