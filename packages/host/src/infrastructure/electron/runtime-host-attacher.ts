import type { WebContentsView } from 'electron';
import type { HostMeta, RuntimeHost } from '../../domain/runtime/runtime-host';

/**
 * RuntimeHostAttacher — 管理 runtime → host 映射。
 * 纯映射逻辑，不涉及 View 创建或状态发布。
 */
export class RuntimeHostAttacher {
    private hostMap = new Map<string, RuntimeHost>();

    attach(runtimeId: string, host: RuntimeHost, view: WebContentsView, meta: HostMeta): void {
        const old = this.hostMap.get(runtimeId);
        if (old && old !== host) {
            old.detach();
        }
        host.attach(view, meta);
        this.hostMap.set(runtimeId, host);
    }

    detach(runtimeId: string): RuntimeHost | null {
        const host = this.hostMap.get(runtimeId);
        if (host) {
            host.detach();
            this.hostMap.delete(runtimeId);
        }
        return host ?? null;
    }

    getHostFor(runtimeId: string): RuntimeHost | null {
        return this.hostMap.get(runtimeId) ?? null;
    }

    hasHost(runtimeId: string): boolean {
        return this.hostMap.has(runtimeId);
    }
}
