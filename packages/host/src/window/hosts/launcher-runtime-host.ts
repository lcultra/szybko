import type { WebContentsView } from 'electron';
import type { PluginRuntime } from '../../runtime/types';
import type { WindowManager } from '../window-manager';
import type { RuntimeHost } from './runtime-host';

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

    attach(runtime: PluginRuntime, view?: WebContentsView): void {
        if (view) {
            this.currentView = view;
            this.windowManager.addChildView(view);
        }
        runtime.host = this;
    }

    detach(runtime: PluginRuntime): void {
        if (this.currentView) {
            this.windowManager.removeChildView(this.currentView);
            this.currentView = null;
        }
        runtime.host = null;
    }
}
