import { describe, it, expect } from 'vitest';
import { buildNavigationMap } from './navigation';

describe('buildNavigationMap', () => {
  it('down stays within same section when next row exists', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 18 }],
      9,
      1, // selectedIndex=1, row=0 col=1
      [{ sectionId: 'pinned', start: 0, length: 18 }],
    );
    // row 1 col 0 = index 9
    expect(map.down).toBe(10); // row=1 col=1
  });

  it('down jumps to next section first row same col when at section bottom', () => {
    const map = buildNavigationMap(
      [
        { sectionId: 'pinned', count: 12 }, // rows 0-1 (12 items in 9 cols = 2 rows)
        { sectionId: 'apps', count: 18 },    // rows 2-3
      ],
      9,
      11, // pinned last item (row=1 col=2, globalIndex 11)
      [
        { sectionId: 'pinned', start: 0, length: 12 },
        { sectionId: 'apps', start: 12, length: 18 },
      ],
    );
    // Should jump to apps row=2 col=2 → globalIndex 12 + 2 = 14
    // pinned: 0-11, apps: 12-29
    expect(map.down).toBe(14); // apps row=0 col=2 (globalIndex 12+2)
  });

  it('down returns null when no next section exists', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 9 }],
      9,
      8, // last item in the only section
      [{ sectionId: 'pinned', start: 0, length: 9 }],
    );
    expect(map.down).toBeNull();
  });

  it('up stays within same section', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 18 }],
      9,
      15, // row=1 col=6
      [{ sectionId: 'pinned', start: 0, length: 18 }],
    );
    expect(map.up).toBe(6); // row=0 col=6
  });

  it('up jumps to previous section last row same col at section top', () => {
    const map = buildNavigationMap(
      [
        { sectionId: 'pinned', count: 12 },
        { sectionId: 'apps', count: 18 },
      ],
      9,
      12, // apps first item (globalIndex 12), row=0 col=0
      [
        { sectionId: 'pinned', start: 0, length: 12 },
        { sectionId: 'apps', start: 12, length: 18 },
      ],
    );
    // pinned: items 0-11 in 9 cols → row 0 idx 0-8, row 1 idx 9-11
    // last row col=0 in pinned = index 9
    expect(map.up).toBe(9);
  });

  it('up returns null at global first item', () => {
    const map = buildNavigationMap(
      [{ sectionId: 'pinned', count: 9 }],
      9,
      0,
      [{ sectionId: 'pinned', start: 0, length: 9 }],
    );
    expect(map.up).toBeNull();
  });
});
