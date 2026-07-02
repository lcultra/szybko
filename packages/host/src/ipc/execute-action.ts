import type { ActionDescriptor } from '@szybko/shared';
import { exec } from 'node:child_process';
import { clipboard, shell } from 'electron';

export function executeAction(action: ActionDescriptor): { ok: boolean; error?: string } {
    switch (action.type) {
        case 'shell.openPath': {
            shell.openPath(action.payload.path);
            return { ok: true };
        }
        case 'shell.openUrl': {
            shell.openExternal(action.payload.url);
            return { ok: true };
        }
        case 'clipboard.writeText': {
            clipboard.writeText(action.payload.text);
            return { ok: true };
        }
        case 'process.launchApp': {
            exec(`open -b "${action.payload.bundleId}"`);
            return { ok: true };
        }
        case 'plugin.open':
        case 'plugin.runCommand': {
            // Plugin actions are handled by the plugin's WebContentsView directly.
            // The main process just acknowledges the action.
            console.warn(`[execute] plugin action: ${action.type}`, action.payload);
            return { ok: true };
        }
        default:
            return { ok: false, error: `Unknown action type: ${(action as any).type}` };
    }
}
