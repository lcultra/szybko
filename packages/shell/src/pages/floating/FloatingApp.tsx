import { useCallback, useEffect } from 'react';
import { PluginView } from '../../components/PluginView';
import { SurfaceFrame } from '../../components/SurfaceFrame';
import { useAppStore } from '../../stores/app-store';

const params = new URLSearchParams(window.location.search);
const initialName = params.get('name') || '';
const initialRuntimeId = params.get('runtimeId') || '';
const initialExplain = params.get('explain') || '';
const initialPluginId = params.get('pluginId') || '';

export function FloatingApp() {
    const setActivePlugin = useAppStore(s => s.setActivePlugin);

    useEffect(() => {
        setActivePlugin(initialPluginId, initialRuntimeId, initialName, initialExplain);
    }, []);

    const handleClose = useCallback(() => {
        if (initialRuntimeId)
            window.szybkoInternal?.destroyPlugin(initialRuntimeId);
    }, []);

    useEffect(() => {
        window.addEventListener('beforeunload', handleClose);
        return () => window.removeEventListener('beforeunload', handleClose);
    }, [handleClose]);

    return (
        <SurfaceFrame className="flex h-dvh flex-col rounded-lg">
            <PluginView hostType="floating" />
        </SurfaceFrame>
    );
}
