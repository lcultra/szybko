import { useCallback, useEffect } from 'react';
import { PluginView } from '../../components/plugin/PluginView';
import { SurfaceFrame } from '../../components/SurfaceFrame';
import { PluginRuntimeService } from '../../services/plugin-runtime';
import { useAppStore } from '../../stores/app-store';
import { useRuntimeStore } from '../../stores/runtime-store';

const params = new URLSearchParams(window.location.search);
const initialName = params.get('name') || '';
const initialRuntimeId = params.get('runtimeId') || '';
const initialExplain = params.get('explain') || '';
const initialPluginId = params.get('pluginId') || '';

export function FloatingApp() {
    const setAppState = useAppStore(s => s.setState);
    const setSlot = useRuntimeStore(s => s.setSlot);

    useEffect(() => {
        setSlot({
            pluginId: initialPluginId,
            runtimeId: initialRuntimeId,
            pluginName: initialName,
            featureExplain: initialExplain,
            loadState: 'loaded',
            mountState: 'attached',
        });
        setAppState('plugin');
    }, []);

    const handleClose = useCallback(() => {
        if (initialRuntimeId)
            PluginRuntimeService.destroy(initialRuntimeId);
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
