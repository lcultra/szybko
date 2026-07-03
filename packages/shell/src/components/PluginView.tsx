import { PluginHeader } from './PluginHeader';
import { PluginScene } from './PluginScene';

interface PluginViewProps {
    variant?: 'launcher' | 'detached';
}

export function PluginView({ variant = 'launcher' }: PluginViewProps) {
    return (
        <div className="flex flex-col">
            <PluginHeader variant={variant} />
            <div className="flex-1">
                <PluginScene />
            </div>
        </div>
    );
}
