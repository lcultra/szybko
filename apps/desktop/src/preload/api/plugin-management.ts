import { IPC } from '@szybko/shared';
import { invoke } from './ipc';

export function createPluginManagementApi() {
    return {
        setPluginEnabled: invoke(IPC.PLUGIN_SET_ENABLED),
        uninstallPlugin: invoke(IPC.PLUGIN_UNINSTALL),
    };
}
