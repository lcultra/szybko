import { describe, expect, it } from 'vitest';
import { ShortcutRegistry } from '../window/shortcut-registry';

describe('shortcutRegistry', () => {
  it('defines and retrieves actions by scope', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      {
        actionId: 'plugin:detach',
        scope: 'main-window',
        description: 'test',
        bindings: [
          { id: 'default', key: 'd', modifiers: { meta: true } },
        ],
      },
    ]);

    const actions = registry.getActions('main-window');
    expect(actions).toHaveLength(1);
    expect(actions[0].actionId).toBe('plugin:detach');
  });

  it('returns empty array for unknown scope', () => {
    const registry = new ShortcutRegistry();
    const actions = registry.getActions('system');
    expect(actions).toHaveLength(0);
  });

  it('filters by actionId when provided', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      { actionId: 'a', scope: 'main-window', description: '', bindings: [] },
      { actionId: 'b', scope: 'main-window', description: '', bindings: [] },
    ]);
    expect(registry.getActions('main-window')).toHaveLength(2);
    expect(registry.getActions('main-window', 'a')).toHaveLength(1);
  });

  it('getAccelerator returns accelerator for scope+platform', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      {
        actionId: 'plugin:detach',
        scope: 'main-window',
        description: '',
        bindings: [
          { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
          { id: 'win', key: 'd', modifiers: { ctrl: true }, platforms: ['win32'] },
        ],
      },
    ]);

    expect(registry.getAccelerator('plugin:detach', { scope: 'main-window', platform: 'darwin' })).toBe('Cmd+D');
    expect(registry.getAccelerator('plugin:detach', { scope: 'main-window', platform: 'win32' })).toBe('Ctrl+D');
  });

  it('getAccelerator returns null when no binding matches platform', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      {
        actionId: 'plugin:detach',
        scope: 'main-window',
        description: '',
        bindings: [
          { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
        ],
      },
    ]);
    expect(registry.getAccelerator('plugin:detach', { scope: 'main-window', platform: 'linux' })).toBeNull();
  });

  it('getActions returns defined actions by scope', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      { actionId: 'main:quit', scope: 'system', description: '', bindings: [] },
      { actionId: 'plugin:detach', scope: 'main-window', description: '', bindings: [] },
    ]);
    expect(registry.getActions('system')).toHaveLength(1);
    expect(registry.getActions('main-window')).toHaveLength(1);
    expect(registry.getActions('plugin-view')).toHaveLength(0);
  });

  it('buildAccelerator produces correct strings via getAccelerator', () => {
    const registry = new ShortcutRegistry();
    registry.define([
      {
        actionId: 'x',
        scope: 'main-window',
        description: '',
        bindings: [
          { id: 'a', key: 'd', modifiers: { ctrl: true, shift: true } },
          { id: 'b', key: ' ', modifiers: { meta: true } },
        ],
      },
    ]);
    expect(registry.getAccelerator('x', { scope: 'main-window', platform: 'darwin', bindingId: 'a' })).toBe('Ctrl+Shift+D');
    expect(registry.getAccelerator('x', { scope: 'main-window', platform: 'darwin', bindingId: 'b' })).toBe('Cmd+Space');
  });

  it('onAction registers and triggers handler', () => {
    const registry = new ShortcutRegistry();
    const calls: string[] = [];
    registry.onAction('test:a', () => calls.push('fired'));
    registry.triggerForTest('test:a');
    expect(calls).toEqual(['fired']);
  });
});
