import { useEffect } from 'react';
import { PluginHeader } from '../../components/PluginHeader';
import { PluginScene } from '../../components/PluginScene';
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

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-surface">
            <PluginHeader variant="floating" />
            <div className="flex-1">
                <PluginScene />
            </div>
        </div>
    );
}
