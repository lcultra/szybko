import { contextBridge } from 'electron';
import { createPluginApi } from './shared.js';

contextBridge.exposeInMainWorld('szybko', createPluginApi());
