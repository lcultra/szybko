import { PluginHeader } from '../../components/PluginHeader';
import { PluginScene } from '../../components/PluginScene';

export function FloatingApp() {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-surface">
            <PluginHeader variant="floating" />
            <div className="flex-1">
                <PluginScene />
            </div>
        </div>
    );
}
