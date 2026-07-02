import { contextBridge } from 'electron';
import { createInternalApi, createPluginApi } from './shared.js';

contextBridge.exposeInMainWorld('szybkoInternal', createInternalApi());
contextBridge.exposeInMainWorld('szybko', createPluginApi());
