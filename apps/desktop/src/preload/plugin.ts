import type { SzybkoPluginApi } from '@szybko/shared';
import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute.js';
import { createPluginLifecycleApi } from './api/plugin-lifecycle.js';

const pluginApi = {
    ...createExecuteApi(),
    ...createPluginLifecycleApi(),
} satisfies SzybkoPluginApi;

contextBridge.exposeInMainWorld('szybko', pluginApi);
