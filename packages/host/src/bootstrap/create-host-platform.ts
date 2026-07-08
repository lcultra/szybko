import type { HostPlatformConfig } from './host-platform-config';
import type { HostPlatform } from './host-platform';

export async function createHostPlatform(config: HostPlatformConfig): Promise<HostPlatform> {
  // Stage 1: empty shell — returns a no-op platform
  // Later stages will fill this in
  return {
    async start() {
      console.log('[host] platform started (skeleton)');
    },
    show() {
      console.log('[host] platform show (skeleton)');
    },
    dispose() {
      console.log('[host] platform disposed (skeleton)');
    },
  };
}
