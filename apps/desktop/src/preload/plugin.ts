import type { SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute';
import { createFeatureApi } from './api/features';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';

const pluginApi = {
    ...createExecuteApi(),
    ...createPluginLifecycleApi(),
    ...createFeatureApi(),
} satisfies SzybkoPluginApi;

contextBridge.exposeInMainWorld('szybko', pluginApi);
