import type { WebContentsView } from 'electron';
import type { HostMeta, RuntimeHost } from './runtime-host';
import type { WindowManager } from '../window-manager';

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

    attach(view: WebContentsView, _meta: HostMeta): void {
        this.currentView = view;
        this.windowManager.addChildView(view);
    }

    detach(): void {
        if (this.currentView) {
            this.windowManager.removeChildView(this.currentView);
            this.currentView = null;
        }
    }
}
