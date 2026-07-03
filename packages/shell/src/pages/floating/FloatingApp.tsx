import { useCallback, useEffect } from 'react';
import type { RuntimeSlot } from '@szybko/shared';
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
    pluginName: '',
    featureExplain: '',
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
    }, []);

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
