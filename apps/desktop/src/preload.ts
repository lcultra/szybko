import { contextBridge, ipcRenderer } from 'electron'

// Thin shell — real API surface is defined in @szybko/host
contextBridge.exposeInMainWorld('utools', {})
