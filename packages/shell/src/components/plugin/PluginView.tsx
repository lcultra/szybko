import { PluginHeader } from './PluginHeader';
import { PluginScene } from './PluginScene';

interface PluginViewProps {
    hostType?: 'launcher' | 'floating';
}

export function PluginView({ hostType = 'launcher' }: PluginViewProps) {
    return (
        <div className="flex flex-col">
            <PluginHeader hostType={hostType} />
            <div className="flex-1">
                <PluginScene />
            </div>
        </div>
    );
}
