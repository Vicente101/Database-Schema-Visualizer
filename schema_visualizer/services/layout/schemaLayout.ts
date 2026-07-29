import type { Table, TableCategory } from '../../types/workspace';

// Relationship-aware graph layout. Reference tables lead into dependent
// tables, connected components stay together, and repeated barycenter passes
// reduce unnecessary relationship crossings.
type GraphLinks = {
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
};

type GraphLayoutResult = {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
};

function createGraphLinks(ids: string[]): GraphLinks {
  return {
    parents: new Map(ids.map((id) => [id, new Set<string>()])),
    children: new Map(ids.map((id) => [id, new Set<string>()])),
  };
}

function buildTableGraphLinks(tables: Table[]): GraphLinks {
  const ids = tables.map((table) => table.name);
  const links = createGraphLinks(ids);
  const names = new Set(ids);
  tables.forEach((childTable) => {
    childTable.columns.forEach((column) => {
      const parentName = column.fk?.table;
      if (!parentName || parentName === childTable.name || !names.has(parentName)) return;
      links.parents.get(childTable.name)!.add(parentName);
      links.children.get(parentName)!.add(childTable.name);
    });
  });
  return links;
}

function graphDegree(id: string, links: GraphLinks): number {
  return (links.parents.get(id)?.size || 0) + (links.children.get(id)?.size || 0);
}

function getGraphComponents(ids: string[], links: GraphLinks): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  [...ids]
    .sort((a, b) => graphDegree(b, links) - graphDegree(a, links) || a.localeCompare(b))
    .forEach((seed) => {
      if (visited.has(seed)) return;
      const queue = [seed];
      const component: string[] = [];
      visited.add(seed);
      while (queue.length) {
        const current = queue.shift()!;
        component.push(current);
        const neighbors = new Set([
          ...(links.parents.get(current) || []),
          ...(links.children.get(current) || []),
        ]);
        [...neighbors].sort().forEach((neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      }
      components.push(component);
    });
  return components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function createReadableGraphLayers(ids: string[], links: GraphLinks): string[][] {
  if (!ids.length) return [];
  const scopedIds = new Set(ids);
  const indegree = new Map<string, number>();
  const levels = new Map<string, number>();
  ids.forEach((id) => {
    indegree.set(id, [...(links.parents.get(id) || [])].filter((parent) => scopedIds.has(parent)).length);
  });

  const queue = ids
    .filter((id) => indegree.get(id) === 0)
    .sort((a, b) =>
      (links.children.get(b)?.size || 0) - (links.children.get(a)?.size || 0) || a.localeCompare(b),
    );
  queue.forEach((id) => levels.set(id, 0));

  while (queue.length) {
    const parent = queue.shift()!;
    const parentLevel = levels.get(parent) || 0;
    [...(links.children.get(parent) || [])]
      .filter((child) => scopedIds.has(child))
      .sort()
      .forEach((child) => {
        levels.set(child, Math.max(levels.get(child) || 0, parentLevel + 1));
        indegree.set(child, (indegree.get(child) || 0) - 1);
        if (indegree.get(child) === 0) queue.push(child);
      });
  }

  // Cycles have no topological root. Anchor their most-connected member, then
  // place the remaining nodes next to a known parent or child.
  const unresolved = new Set(ids.filter((id) => !levels.has(id)));
  while (unresolved.size) {
    let progressed = false;
    [...unresolved].forEach((id) => {
      const knownParents = [...(links.parents.get(id) || [])]
        .filter((parent) => levels.has(parent))
        .map((parent) => levels.get(parent)!);
      const knownChildren = [...(links.children.get(id) || [])]
        .filter((child) => levels.has(child))
        .map((child) => levels.get(child)!);
      if (knownParents.length) {
        levels.set(id, Math.max(...knownParents) + 1);
      } else if (knownChildren.length) {
        levels.set(id, Math.max(0, Math.min(...knownChildren) - 1));
      } else {
        return;
      }
      unresolved.delete(id);
      progressed = true;
    });
    if (!progressed) {
      const anchor = [...unresolved].sort(
        (a, b) => graphDegree(b, links) - graphDegree(a, links) || a.localeCompare(b),
      )[0];
      levels.set(anchor, 0);
      unresolved.delete(anchor);
    }
  }

  const maxLevel = Math.max(0, ...levels.values());
  const layers = Array.from({ length: maxLevel + 1 }, () => [] as string[]);
  ids.forEach((id) => layers[levels.get(id) || 0].push(id));
  layers.forEach((layer) =>
    layer.sort((a, b) => graphDegree(b, links) - graphDegree(a, links) || a.localeCompare(b)),
  );

  const orderLayer = (layerIndex: number, neighborLayerIndex: number) => {
    const neighborOrder = new Map(layers[neighborLayerIndex].map((id, index) => [id, index]));
    const currentOrder = new Map(layers[layerIndex].map((id, index) => [id, index]));
    layers[layerIndex].sort((a, b) => {
      const score = (id: string) => {
        const neighbors = [
          ...(links.parents.get(id) || []),
          ...(links.children.get(id) || []),
        ].filter((neighbor) => neighborOrder.has(neighbor));
        if (!neighbors.length) return currentOrder.get(id) || 0;
        return neighbors.reduce((sum, neighbor) => sum + neighborOrder.get(neighbor)!, 0) / neighbors.length;
      };
      return score(a) - score(b) || graphDegree(b, links) - graphDegree(a, links) || a.localeCompare(b);
    });
  };

  for (let pass = 0; pass < 4; pass += 1) {
    for (let layer = 1; layer < layers.length; layer += 1) orderLayer(layer, layer - 1);
    for (let layer = layers.length - 2; layer >= 0; layer -= 1) orderLayer(layer, layer + 1);
  }
  return layers.filter((layer) => layer.length > 0);
}

function layoutGraphNodes(
  ids: string[],
  links: GraphLinks,
  widthFor: (id: string) => number,
  heightFor: (id: string) => number,
  options: {
    columnGap: number;
    rowGap: number;
    componentGap: number;
    maxShelfWidth: number;
  },
): GraphLayoutResult {
  if (!ids.length) return { positions: new Map(), width: 0, height: 0 };
  const positions = new Map<string, { x: number; y: number }>();
  const componentLayouts = getGraphComponents(ids, links).map((component) => {
    const layers = createReadableGraphLayers(component, links);
    const layerWidths = layers.map((layer) => Math.max(...layer.map(widthFor)));
    const layerHeights = layers.map((layer) =>
      layer.reduce((sum, id) => sum + heightFor(id), 0) + Math.max(0, layer.length - 1) * options.rowGap,
    );
    const width =
      layerWidths.reduce((sum, layerWidth) => sum + layerWidth, 0) +
      Math.max(0, layers.length - 1) * options.columnGap;
    const height = Math.max(...layerHeights);
    const localPositions = new Map<string, { x: number; y: number }>();
    let layerX = 0;
    layers.forEach((layer, layerIndex) => {
      let rowY = (height - layerHeights[layerIndex]) / 2;
      layer.forEach((id) => {
        localPositions.set(id, {
          x: layerX + (layerWidths[layerIndex] - widthFor(id)) / 2,
          y: rowY,
        });
        rowY += heightFor(id) + options.rowGap;
      });
      layerX += layerWidths[layerIndex] + options.columnGap;
    });
    return { ids: component, positions: localPositions, width, height };
  });

  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;
  let totalWidth = 0;
  componentLayouts.forEach((component) => {
    if (cursorX > 0 && cursorX + component.width > options.maxShelfWidth) {
      cursorX = 0;
      cursorY += shelfHeight + options.componentGap;
      shelfHeight = 0;
    }
    component.ids.forEach((id) => {
      const local = component.positions.get(id)!;
      positions.set(id, { x: cursorX + local.x, y: cursorY + local.y });
    });
    cursorX += component.width + options.componentGap;
    shelfHeight = Math.max(shelfHeight, component.height);
    totalWidth = Math.max(totalWidth, cursorX - options.componentGap);
  });
  return {
    positions,
    width: totalWidth,
    height: cursorY + shelfHeight,
  };
}

function layoutTableGraph(tables: Table[], maxShelfWidth = 1760): GraphLayoutResult {
  const tableByName = new Map(tables.map((table) => [table.name, table]));
  return layoutGraphNodes(
    tables.map((table) => table.name),
    buildTableGraphLinks(tables),
    () => 300,
    (id) => 60 + (tableByName.get(id)?.columns.length || 0) * 30,
    {
      columnGap: 132,
      rowGap: 68,
      componentGap: 140,
      maxShelfWidth,
    },
  );
}

export function autoLayout(tables: Table[]): Table[] {
  const graphLayout = layoutTableGraph(tables);
  return tables.map((table) => {
    const position = graphLayout.positions.get(table.name);
    return position ? { ...table, x: position.x + 72, y: position.y + 72 } : table;
  });
}

// Categories are first laid out as a dependency graph, then the tables inside
// every category are laid out as a separate relationship graph.
export function layoutTablesByCategory(tables: Table[], categories: TableCategory[]): Table[] {
  if (!tables.length) return [];
  const groups: Array<{ id: string; name: string; tables: Table[]; local: GraphLayoutResult }> = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      tables: tables.filter((table) => table.category === category.id),
    }))
    .filter((group) => group.tables.length > 0)
    .map((group) => ({ ...group, local: layoutTableGraph(group.tables, 980) }));
  const uncategorized = tables.filter((table) => !table.category);
  if (uncategorized.length) {
    groups.push({
      id: '__uncategorized__',
      name: 'Uncategorized',
      tables: uncategorized,
      local: layoutTableGraph(uncategorized, 980),
    });
  }

  const groupForTable = new Map<string, string>();
  groups.forEach((group) => group.tables.forEach((table) => groupForTable.set(table.name, group.id)));
  const groupLinks = createGraphLinks(groups.map((group) => group.id));
  tables.forEach((childTable) => {
    const childGroup = groupForTable.get(childTable.name);
    if (!childGroup) return;
    childTable.columns.forEach((column) => {
      const parentGroup = column.fk ? groupForTable.get(column.fk.table) : undefined;
      if (!parentGroup || parentGroup === childGroup) return;
      groupLinks.parents.get(childGroup)!.add(parentGroup);
      groupLinks.children.get(parentGroup)!.add(childGroup);
    });
  });

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const groupLayout = layoutGraphNodes(
    groups.map((group) => group.id),
    groupLinks,
    (id) => (groupById.get(id)?.local.width || 300) + 60,
    (id) => (groupById.get(id)?.local.height || 120) + 88,
    {
      columnGap: 170,
      rowGap: 150,
      componentGap: 190,
      maxShelfWidth: 2200,
    },
  );

  const positions = new Map<string, { x: number; y: number }>();
  groups.forEach((group) => {
    const groupPosition = groupLayout.positions.get(group.id) || { x: 0, y: 0 };
    group.tables.forEach((table) => {
      const local = group.local.positions.get(table.name) || { x: 0, y: 0 };
      positions.set(table.name, {
        x: 90 + groupPosition.x + 30 + local.x,
        y: 108 + groupPosition.y + 58 + local.y,
      });
    });
  });

  return tables.map((table) => ({ ...table, ...(positions.get(table.name) || {}) }));
}
