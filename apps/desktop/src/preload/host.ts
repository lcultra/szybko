import type { SzybkoInternalApi, SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';
import { createSearchApi } from './api/search';
import { createThemeApi } from './api/theme';
import { createWindowApi } from './api/window';

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
