import { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
import { useRuntimeStore } from '../stores/runtime-store';

/**
 * 插件运行时生命周期 hook。
 * 订阅 onRuntimeStateChanged → 同步更新 RuntimeStore + AppStore。
 *
 * 所有组件通过此 hook 感知插件状态变化，
 * 不再直接调用 window.szybko.onRuntimeStateChanged。
 */
export function usePluginRuntime(onAttach?: () => void) {
    const setSlot = useRuntimeStore(s => s.setSlot);
    const clearSlot = useRuntimeStore(s => s.clearSlot);
    const setAppState = useAppStore(s => s.setState);

    useEffect(() => {
        const cleanup = window.szybko?.onRuntimeStateChanged?.((payload: any) => {
            if (payload?.state === 'attached') {
                setSlot({
                    runtimeId: payload.runtimeId,
                    pluginId: payload.pluginId,
                    pluginName: payload.pluginName ?? '',
                    featureExplain: payload.featureExplain ?? '',
                    loadState: payload.loadState ?? 'loaded',
                    mountState: payload.mountState ?? 'attached',
                });
                setAppState('plugin');
                onAttach?.();
            } else if (payload?.state === 'detached' || payload?.state === 'destroyed') {
                clearSlot();
                setAppState('idle');
            }
        });
        return () => cleanup?.();
    }, [setSlot, clearSlot, setAppState, onAttach]);
}
