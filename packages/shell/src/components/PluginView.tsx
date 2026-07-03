import { PluginHeader } from './PluginHeader';
import { PluginScene } from './PluginScene';

interface PluginViewProps {
    variant?: 'launcher' | 'floating';
}

export function PluginView({ variant = 'launcher' }: PluginViewProps) {
    return (
        <>
            <PluginHeader variant={variant} />
            <div className="flex-1">
                <PluginScene />
            </div>
        </>
    );
}
