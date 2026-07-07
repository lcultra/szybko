import type { RuntimeSlot } from '@szybko/shared';
import { useCallback, useEffect } from 'react';
import { PluginView } from '../../components/plugin/PluginView';
import { SurfaceFrame } from '../../components/SurfaceFrame';
import { PluginRuntimeService } from '../../services/plugin-runtime';
import { useAppStore } from '../../stores/app-store';
import { useRuntimeStore } from '../../stores/runtime-store';

const params = new URLSearchParams(window.location.search);
const slotParam = params.get('slot');
const fallbackSlot: RuntimeSlot = {
    runtimeId: null,
    pluginId: null,
    featureExplain: '',
    cmdLabel: '',
    loadState: 'loading',
    mountState: 'detached',
};
let initialSlot: RuntimeSlot;
try {
    initialSlot = slotParam ? (JSON.parse(slotParam) as RuntimeSlot) : fallbackSlot;
}
catch {
    initialSlot = fallbackSlot;
}

export function FloatingApp() {
    const setAppState = useAppStore(s => s.setState);
    const setSlot = useRuntimeStore(s => s.setSlot);

    useEffect(() => {
        setSlot(initialSlot);
        setAppState('plugin');
    }, [setAppState, setSlot]);

    // 监听 IPC slot 更新（pool 复用窗口时切换插件信息）
    useEffect(() => {
        const unsubscribe = window.szybkoInternal?.onFloatingSlotUpdate?.((slot) => {
            setSlot(slot);
            // runtimeId 变化 → PluginHeader 的 pin state 自动重置
        });
        return () => unsubscribe?.();
    }, [setSlot]);

    const handleClose = useCallback(() => {
        if (initialSlot.runtimeId)
            PluginRuntimeService.destroy(initialSlot.runtimeId);
    }, []);

    useEffect(() => {
        window.addEventListener('beforeunload', handleClose);
        return () => window.removeEventListener('beforeunload', handleClose);
    }, [handleClose]);

    return (
        <SurfaceFrame className="flex h-dvh flex-col">
            <PluginView hostType="floating" />
        </SurfaceFrame>
    );
}
