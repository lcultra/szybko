import type { Host, PluginRuntime } from '@szybko/shared';

export class LauncherHost implements Host {
    id: string;
    type = 'launcher' as const;

    constructor(id: string) { this.id = id; }

    attach(runtime: PluginRuntime) {
        runtime.state = 'attached';
        runtime.host = this;
    }

    detach(runtime: PluginRuntime) {
        runtime.state = 'detached';
        runtime.host = null;
    }
}
