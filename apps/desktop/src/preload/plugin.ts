import type { SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createPluginExecuteApi } from './api/execute';
import { createFeatureApi } from './api/features';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';

const pluginApi = {
    ...createPluginExecuteApi(),
    ...createPluginLifecycleApi(),
    ...createFeatureApi(),
} satisfies SzybkoPluginApi;

contextBridge.exposeInMainWorld('szybko', pluginApi);
