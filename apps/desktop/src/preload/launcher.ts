import { contextBridge } from 'electron';
import { createInternalApi, createPluginApi } from './shared.js';

const pluginApi = createPluginApi();
const internalApi = createInternalApi();

contextBridge.exposeInMainWorld('szybkoInternal', internalApi);
contextBridge.exposeInMainWorld('szybko', pluginApi);
