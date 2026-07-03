import type { NativeCapabilityService } from './native-capability-service';
import { execFile } from 'node:child_process';
import { clipboard, shell } from 'electron';

export class ElectronNativeCapabilityService implements NativeCapabilityService {
    async openPath(path: string): Promise<void> {
        await shell.openPath(path);
    }

    async openUrl(url: string): Promise<void> {
        await shell.openExternal(url);
    }

    async writeClipboard(text: string): Promise<void> {
        clipboard.writeText(text);
    }

    async launchApp(bundleId: string): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            execFile('open', ['-b', bundleId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}
