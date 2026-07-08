import type { PluginEnterPayload } from '@szybko/shared';
import { RuntimeCoordinator } from '../../runtime/runtime-coordinator';
import type { PluginId, RuntimeId } from '../../shared/ids';

export class RuntimeApplicationService {
  constructor(private coordinator: RuntimeCoordinator) {}

  async activatePlugin(pluginId: PluginId, featureCode?: string, enterPayload?: unknown): Promise<void> {
    this.coordinator.activatePlugin(pluginId, featureCode, enterPayload as Partial<PluginEnterPayload> | undefined);
  }

  async moveToHost(runtimeId: RuntimeId, targetHost: string): Promise<void> {
    this.coordinator.moveToHost(runtimeId, targetHost as 'launcher' | 'floating');
  }

  async hideRuntime(runtimeId: RuntimeId): Promise<void> {
    this.coordinator.hideRuntime(runtimeId);
  }

  async destroyRuntime(runtimeId: RuntimeId): Promise<void> {
    this.coordinator.destroyRuntime(runtimeId);
  }

  async pinRuntime(runtimeId: RuntimeId, pin: boolean): Promise<void> {
    this.coordinator.pinRuntime(runtimeId, pin);
  }

  async showPluginMenu(runtimeId: RuntimeId, variant?: string): Promise<void> {
    this.coordinator.showPluginMenu(runtimeId, variant as 'launcher' | 'floating' | undefined);
  }

  async resolvePluginIdForWebContents(webContentsId: number): Promise<PluginId | null> {
    return this.coordinator.pluginIdForWebContents(webContentsId) as PluginId | null;
  }
}
