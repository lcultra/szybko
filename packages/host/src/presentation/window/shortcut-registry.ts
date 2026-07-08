import type {
    ShortcutActionDef,
    ShortcutBinding,
    ShortcutPlatform,
    ShortcutScope,
} from '@szybko/shared';
import type { WebContents } from 'electron';
import { platform } from 'node:process';
import { globalShortcut } from 'electron';

type Disposer = () => void;

export class ShortcutRegistry {
    private defs: ShortcutActionDef[] = [];
    private actionHandlers = new Map<string, (...args: any[]) => void>();
    private disposers: Disposer[] = [];
    private activeBindings: string[] = [];

    // ── Definition ──

    define(actions: ShortcutActionDef[]): void {
        this.defs.push(...actions);
    }

    getActions(scope: ShortcutScope, actionId?: string): ShortcutActionDef[] {
        return this.defs.filter(
            a => a.scope === scope && (!actionId || a.actionId === actionId),
        );
    }

    getAccelerator(
        actionId: string,
        options: { scope: ShortcutScope; platform?: ShortcutPlatform; bindingId?: string },
    ): string | null {
        const action = this.getActions(options.scope, actionId)[0];
        if (!action)
            return null;
        const currentPlatform = options.platform ?? platform as ShortcutPlatform;
        const binding = options.bindingId
            ? action.bindings.find(b => b.id === options.bindingId)
            : action.bindings.find(b => !b.platforms || b.platforms.includes(currentPlatform));
        if (!binding)
            return null;
        return binding.accelerator ?? this.buildAccelerator(binding);
    }

    // ── Handler injection ──

    onAction(actionId: string, fn: (...args: any[]) => void): void {
        this.actionHandlers.set(actionId, fn);
    }

    // ── Scope registration ──

    registerSystemGlobal(): Disposer {
        const accels: string[] = [];
        for (const action of this.getActions('system')) {
            for (const binding of action.bindings) {
                if (binding.platforms && !binding.platforms.includes(platform as ShortcutPlatform))
                    continue;
                const accel = binding.accelerator ?? this.buildAccelerator(binding);
                globalShortcut.register(accel, () => this.trigger(action.actionId));
                accels.push(accel);
                this.activeBindings.push(accel);
            }
        }
        return this.trackDisposer(() => accels.forEach(a => globalShortcut.unregister(a)));
    }

    registerMainWindow(webContents: WebContents): Disposer {
        const handler = (_e: Electron.Event, input: Electron.Input) => {
            if (input.type !== 'keyDown')
                return;
            for (const action of this.getActions('main-window')) {
                for (const binding of action.bindings) {
                    if (this.matchBinding(binding, input)) {
                        if (binding.preventDefault ?? false)
                            _e.preventDefault();
                        this.trigger(action.actionId);
                        return;
                    }
                }
            }
        };
        webContents.on('before-input-event', handler);
        return this.trackDisposer(() => webContents.removeListener('before-input-event', handler));
    }

    registerPluginView(
        webContents: WebContents,
        instanceActions: Record<string, (...args: any[]) => void>,
    ): Disposer {
        const handler = (_e: Electron.Event, input: Electron.Input) => {
            if (input.type !== 'keyDown')
                return;
            for (const action of this.getActions('plugin-view')) {
                for (const binding of action.bindings) {
                    if (this.matchBinding(binding, input)) {
                        if (binding.preventDefault ?? false)
                            _e.preventDefault();
                        instanceActions[action.actionId]?.();
                        return;
                    }
                }
            }
        };
        webContents.on('before-input-event', handler);

        const cleanup = () => {
            webContents.removeListener('before-input-event', handler);
            webContents.removeListener('destroyed', cleanup);
        };
        webContents.on('destroyed', cleanup);

        const disposer = this.trackDisposer(cleanup);

        return disposer;
    }

    // ── Lifecycle ──

    dispose(): void {
        this.activeBindings.forEach(a => globalShortcut.unregister(a));
        this.activeBindings = [];
        this.disposers.forEach(d => d());
        this.disposers = [];
    }

    // ── Internal ──

    /** @internal */
    triggerForTest(actionId: string): void {
        this.trigger(actionId);
    }

    private trigger(actionId: string): void {
        this.actionHandlers.get(actionId)?.();
    }

    private trackDisposer(d: Disposer): Disposer {
        this.disposers.push(d);
        return d;
    }

    matchBinding(binding: ShortcutBinding, input: Electron.Input): boolean {
        if (input.key.toLowerCase() !== binding.key.toLowerCase())
            return false;
        if (Boolean(input.control) !== (binding.modifiers.ctrl ?? false))
            return false;
        if (Boolean(input.meta) !== (binding.modifiers.meta ?? false))
            return false;
        if (Boolean(input.alt) !== (binding.modifiers.alt ?? false))
            return false;
        if (Boolean(input.shift) !== (binding.modifiers.shift ?? false))
            return false;
        return true;
    }

    private buildAccelerator(binding: ShortcutBinding): string {
        const parts: string[] = [];
        if (binding.modifiers.ctrl)
            parts.push('Ctrl');
        if (binding.modifiers.meta)
            parts.push('Cmd');
        if (binding.modifiers.alt)
            parts.push('Alt');
        if (binding.modifiers.shift)
            parts.push('Shift');
        parts.push(binding.key === ' ' ? 'Space' : binding.key[0].toUpperCase() + binding.key.slice(1));
        return parts.join('+');
    }
}
