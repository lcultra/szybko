import { contextBridge } from 'electron';
import { createPluginApi } from './shared.js';

const pluginApi = createPluginApi();

contextBridge.exposeInMainWorld('szybko', pluginApi);
