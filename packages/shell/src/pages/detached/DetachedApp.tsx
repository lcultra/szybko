import { useCallback, useEffect } from 'react';
import { PluginView } from '../../components/PluginView';
import { useAppStore } from '../../stores/app-store';

const params = new URLSearchParams(window.location.search);
const initialName = params.get('name') || '';
const initialRuntimeId = params.get('runtimeId') || '';
const initialExplain = params.get('explain') || '';
const initialPluginId = params.get('pluginId') || '';

export function DetachedApp() {
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
        <div className="flex h-dvh flex-col overflow-hidden bg-surface">
            <PluginView variant="detached" />
        </div>
    );
}
