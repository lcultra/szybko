import type { SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createFeatureApi } from './api/features';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';

const pluginApi = {
    ...createPluginLifecycleApi(),
    ...createFeatureApi(),
} satisfies SzybkoPluginApi;

contextBridge.exposeInMainWorld('szybko', pluginApi);
