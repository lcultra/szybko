import type { WebContentsView } from 'electron';
import type { WindowManager } from '../window/window-manager';
import type { HostMeta, RuntimeHost } from './runtime-host';

export class LauncherRuntimeHost implements RuntimeHost {
    readonly id: string;
    readonly type = 'launcher' as const;
    private currentView: WebContentsView | null = null;

    constructor(
        id: string,
        private windowManager: WindowManager,
    ) {
        this.id = id;
    }

    attach(view: unknown, _meta: HostMeta): void {
        this.currentView = view as WebContentsView;
        this.windowManager.addChildView(this.currentView);
    }

    detach(): void {
        if (this.currentView) {
            this.windowManager.removeChildView(this.currentView);
            this.currentView = null;
        }
    }
}
