/**
 * VisualCell 导航模型——不依赖全局列数算术。
 * SectionList 根据实际可见 items 生成 cells 数组，
 * useKeyboard 只消费 NavigationMap 中的 up/down/left/right 指针。
 */

export interface VisualCell {
    globalIndex: number;
    sectionId: string;
    row: number;
    col: number;
    colSpan: number;
}

export interface NavigationMap {
    currentCell: VisualCell;
    cells: VisualCell[];
    up: number | null;
    down: number | null;
    left: number | null;
    right: number | null;
}

/**
 * 根据每 section 的可见 items 数量和列数生成 VisualCell 网格。
 * 每个 section 独立计算行列，然后拼接到全局 cells 数组。
 */
export function buildNavigationMap(
    sectionItemCounts: Array<{ sectionId: string; count: number }>,
    columns: number,
    selectedIndex: number,
): NavigationMap {
    const cells: VisualCell[] = [];
    let globalIdx = 0;

    for (const { sectionId, count } of sectionItemCounts) {
        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            cells.push({
                globalIndex: globalIdx,
                sectionId,
                row,
                col,
                colSpan: 1,
            });
            globalIdx++;
        }
    }

    const current = cells.find(c => c.globalIndex === selectedIndex) ?? cells[0];
    if (!current) {
        return { currentCell: cells[0]!, cells, up: null, down: null, left: null, right: null };
    }

    // 按空间坐标找最近邻居
    const up = cells.find(c => c.col === current.col && c.row === current.row - 1 && c.sectionId === current.sectionId);
    const down = cells.find(c => c.col === current.col && c.row === current.row + 1);
    const left = cells.find(c => c.row === current.row && c.col === current.col - 1 && c.sectionId === current.sectionId);
    const right = cells.find(c => c.row === current.row && c.col === current.col + 1 && c.sectionId === current.sectionId);

    return {
        currentCell: current,
        cells,
        up: up?.globalIndex ?? null,
        down: down?.globalIndex ?? null,
        left: left?.globalIndex ?? null,
        right: right?.globalIndex ?? null,
    };
}
