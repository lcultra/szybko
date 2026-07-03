import type { SzybkoInternalApi, SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute';
import { createFeatureApi } from './api/features';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';
import { createSearchApi } from './api/search';
import { createThemeApi } from './api/theme';
import { createWindowApi } from './api/window';

const pluginApi = {
    ...createExecuteApi(),
    ...createPluginLifecycleApi(),
    ...createFeatureApi(),
} satisfies SzybkoPluginApi;

const internalApi = {
    ...createSearchApi(),
    ...createWindowApi(),
    ...createThemeApi(),
} satisfies SzybkoInternalApi;

contextBridge.exposeInMainWorld('szybko', pluginApi);
contextBridge.exposeInMainWorld('szybkoInternal', internalApi);
