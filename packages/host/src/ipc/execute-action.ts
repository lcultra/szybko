import type { ActionDescriptor } from '@szybko/shared';
import type { NativeCapabilityService } from '../native/native-capability-service';

export function createExecutor(native: NativeCapabilityService) {
    return async function executeAction(action: ActionDescriptor): Promise<{ ok: boolean; error?: string }> {
        try {
            switch (action.type) {
                case 'shell.openPath':
                    await native.openPath(action.payload.path);
                    return { ok: true };
                case 'shell.openUrl':
                    await native.openUrl(action.payload.url);
                    return { ok: true };
                case 'clipboard.writeText':
                    await native.writeClipboard(action.payload.text);
                    return { ok: true };
                case 'process.launchApp':
                    await native.launchApp(action.payload.bundleId);
                    return { ok: true };
                case 'plugin.open':
                case 'plugin.runCommand':
                    console.warn(`[execute] plugin action: ${action.type}`, action.payload);
                    return { ok: true };
                default:
                    return { ok: false, error: `Unknown action type: ${(action as any).type}` };
            }
        }
        catch (err) {
            return { ok: false, error: String(err) };
        }
    };
}

export type Executor = ReturnType<typeof createExecutor>;
