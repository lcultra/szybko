import type { SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute';
import { createPluginLifecycleApi } from './api/plugin-lifecycle';

const pluginApi = {
    ...createExecuteApi(),
    ...createPluginLifecycleApi(),
} satisfies SzybkoPluginApi;

contextBridge.exposeInMainWorld('szybko', pluginApi);
