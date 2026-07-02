import { contextBridge } from 'electron';
import { createExecuteApi } from './api/execute.js';
import { createPluginLifecycleApi } from './api/plugin-lifecycle.js';

contextBridge.exposeInMainWorld('szybko', {
    ...createExecuteApi(),
    ...createPluginLifecycleApi(),
});
