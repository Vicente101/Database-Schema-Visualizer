import { useCallback, useEffect, useRef, useState } from 'react';
import AddCircleIcon from '@solar-icons/react/icons/ui/AddCircle';
import MinusCircleIcon from '@solar-icons/react/icons/ui/MinusCircle';
import type { Schema, Table, ThemeMode } from '../../types/workspace';

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Renderer
// ─────────────────────────────────────────────────────────────────────────────
interface CanvasProps {
  schema: Schema;
  theme: ThemeMode;
  selectedTable: string | null;
  onSelectTable: (name: string | null) => void;
  onMoveTable: (name: string, x: number, y: number) => void;
  onMoveCategory?: (categoryId: string, dx: number, dy: number) => void;
  showCategories?: boolean;
  fitSignal?: string;
}

const CANVAS_TABLE_WIDTH = 300;
const CANVAS_HEADER_HEIGHT = 48;
const CANVAS_ROW_HEIGHT = 30;
const CANVAS_TABLE_FOOTER = 12;

function canvasTableHeight(table: Table): number {
  return CANVAS_HEADER_HEIGHT + table.columns.length * CANVAS_ROW_HEIGHT + CANVAS_TABLE_FOOTER;
}

function columnCenterY(table: Table, index: number): number {
  return (table.y || 0) + CANVAS_HEADER_HEIGHT + index * CANVAS_ROW_HEIGHT + CANVAS_ROW_HEIGHT / 2;
}

function withCanvasAlpha(color: string | undefined, alpha: string, fallback = '#6366f1'): string {
  const resolved = color || fallback;
  return /^#[0-9a-f]{6}$/i.test(resolved) ? `${resolved}${alpha}` : resolved;
}

export function SchemaCanvas({ schema, theme, selectedTable, onSelectTable, onMoveTable, onMoveCategory, showCategories = true, fitSignal }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ type: 'pan' | 'table' | 'category'; tableName?: string; categoryId?: string; startX: number; startY: number } | null>(null);
  const [hoveringCategory, setHoveringCategory] = useState(false);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; startZoom: number; worldX: number; worldY: number } | null>(null);
  const lastMobileFitRef = useRef('');

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const isLight = theme === 'light';
    const canvasColors = isLight
      ? {
          bgStart: '#eef4f8',
          bgMid: '#f8fbfd',
          bgEnd: '#e7eef4',
          grid: 'rgba(71, 85, 105, 0.10)',
          cardTop: '#ffffff',
          cardMid: '#f7fafc',
          cardBottom: '#edf2f7',
          headerStart: '#f8fafc',
          headerMid: '#eef3f7',
          headerEnd: '#e6edf3',
          cardStroke: 'rgba(71,85,105,0.22)',
          rowEven: '#f8fafc',
          rowOdd: '#f1f5f9',
          rowLine: 'rgba(71,85,105,0.12)',
          title: '#172033',
          body: '#334155',
          muted: '#64748b',
          edgeUnderlay: 'rgba(255,255,255,0.92)',
        }
      : {
          bgStart: '#0f1318',
          bgMid: '#151a21',
          bgEnd: '#0b1016',
          grid: 'rgba(148, 163, 184, 0.055)',
          cardTop: '#232932',
          cardMid: '#181f27',
          cardBottom: '#111820',
          headerStart: '#2a313b',
          headerMid: '#202832',
          headerEnd: '#18202a',
          cardStroke: 'rgba(255,255,255,0.11)',
          rowEven: '#141b23',
          rowOdd: '#111820',
          rowLine: 'rgba(255,255,255,0.06)',
          title: '#f8fafc',
          body: '#cbd5e1',
          muted: '#64748b',
          edgeUnderlay: 'rgba(2, 6, 23, 0.78)',
        };
    const canvasAccent = isLight ? '#416174' : '#91a9b9';
    const groupAccent = isLight ? '#647784' : '#7f929f';

    const bg = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    bg.addColorStop(0, canvasColors.bgStart);
    bg.addColorStop(0.48, canvasColors.bgMid);
    bg.addColorStop(1, canvasColors.bgEnd);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Grid
    ctx.strokeStyle = canvasColors.grid;
    ctx.lineWidth = 1;
    const gridSize = 40 * zoom;
    const offsetX = (pan.x % gridSize);
    const offsetY = (pan.y % gridSize);
    for (let x = offsetX; x < rect.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < rect.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const fitText = (text: string, maxWidth: number) => {
      if (ctx.measureText(text).width <= maxWidth) return text;
      let output = text;
      while (output.length > 4 && ctx.measureText(`${output}...`).width > maxWidth) {
        output = output.slice(0, -1);
      }
      return `${output}...`;
    };

    // Draw category backgrounds if enabled
    if (showCategories && schema.categories && schema.categories.length > 0) {
      schema.categories.forEach((category) => {
        const tablesInCategory = schema.tables.filter(t => t.category === category.id);
        if (tablesInCategory.length === 0) return;

        // Calculate bounding box for tables in this category
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        tablesInCategory.forEach(table => {
          if (table.x === undefined || table.y === undefined) return;
          const tableW = CANVAS_TABLE_WIDTH;
          const tableH = canvasTableHeight(table);
          minX = Math.min(minX, table.x);
          minY = Math.min(minY, table.y);
          maxX = Math.max(maxX, table.x + tableW);
          maxY = Math.max(maxY, table.y + tableH);
        });

        if (minX === Infinity) return;

        // Padding around the group
        const padding = 30;
        const labelHeight = 28;
        minX -= padding;
        minY -= padding + labelHeight;
        maxX += padding;
        maxY += padding;

        // Draw category background
        ctx.fillStyle = withCanvasAlpha(groupAccent, isLight ? '10' : '16');
        ctx.strokeStyle = withCanvasAlpha(groupAccent, isLight ? '58' : '50');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(minX, minY, maxX - minX, maxY - minY, 2);
        ctx.fill();
        ctx.stroke();

        // Draw category label (draggable)
        const labelGrad = ctx.createLinearGradient(minX, minY, minX + 232, minY);
        labelGrad.addColorStop(0, withCanvasAlpha(groupAccent, 'f0'));
        labelGrad.addColorStop(1, withCanvasAlpha(groupAccent, isLight ? 'b8' : '98'));
        ctx.fillStyle = labelGrad;
        ctx.beginPath();
        ctx.roundRect(minX, minY, 224, labelHeight, [2, 2, 0, 0]);
        ctx.fill();

        // Move icon hint
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.font = '700 10px Inter, system-ui, sans-serif';
        ctx.fillText('⋮⋮', minX + 8, minY + labelHeight / 2);

        ctx.fillStyle = labelGrad;
        ctx.fillRect(minX + 6, minY + 4, 18, labelHeight - 8);
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillText('::', minX + 10, minY + labelHeight / 2);

        ctx.fillStyle = '#fff';
        ctx.font = '700 11px Inter, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(category.name, minX + 28, minY + labelHeight / 2);

        ctx.fillStyle = isLight ? 'rgba(51,65,85,0.62)' : 'rgba(226,232,240,0.58)';
        ctx.font = '700 8px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('DRAG GROUP', maxX - 10, minY + labelHeight / 2);
        ctx.textAlign = 'left';
      });
    }

    // Draw edges (FK relationships)
    let relationshipIndex = 0;
    schema.tables.forEach((table) => {
      table.columns.forEach((col) => {
        if (col.fk) {
          const refTable = schema.tables.find((t) => t.name === col.fk!.table);
          if (refTable && table.x !== undefined && table.y !== undefined && refTable.x !== undefined && refTable.y !== undefined) {
            const sourceTableX = table.x;
            const fromIndex = table.columns.indexOf(col);
            const toIndex = refTable.columns.findIndex((c) => c.name.toLowerCase() === col.fk!.column.toLowerCase());
            const tableCenterX = table.x + CANVAS_TABLE_WIDTH / 2;
            const refCenterX = refTable.x + CANVAS_TABLE_WIDTH / 2;
            const refIsRight = refCenterX >= tableCenterX;
            const fromSide = refIsRight ? 'right' : 'left';
            const toSide = refIsRight ? 'left' : 'right';
            const fromDir = fromSide === 'right' ? 1 : -1;
            const toDir = toSide === 'right' ? 1 : -1;
            const fromX = table.x + (fromSide === 'right' ? CANVAS_TABLE_WIDTH + 2 : -2);
            const fromY = columnCenterY(table, fromIndex);
            const toX = refTable.x + (toSide === 'right' ? CANVAS_TABLE_WIDTH + 2 : -2);
            const toY = toIndex >= 0 ? columnCenterY(refTable, toIndex) : refTable.y + CANVAS_HEADER_HEIGHT / 2;
            const isSelfReference = table.name === refTable.name;
            let arrowAngle = 0;

            const buildRelationshipPath = () => {
              ctx.beginPath();
              ctx.moveTo(fromX, fromY);

              if (isSelfReference) {
                const loop = 76 + (relationshipIndex % 3) * 16;
                const cp1X = sourceTableX + CANVAS_TABLE_WIDTH + loop;
                const cp1Y = fromY;
                const cp2X = sourceTableX + CANVAS_TABLE_WIDTH + loop;
                const cp2Y = toY - 54;
                arrowAngle = Math.atan2(toY - cp2Y, toX - cp2X);
                ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, toX, toY);
                return;
              }

              const horizontalDistance = Math.abs(toX - fromX);
              const verticalDistance = Math.abs(toY - fromY);
              const tension = Math.max(90, Math.min(220, horizontalDistance * 0.46 + verticalDistance * 0.16));
              const laneOffset = ((relationshipIndex % 5) - 2) * 5;
              const cp1X = fromX + fromDir * tension;
              const cp1Y = fromY + laneOffset;
              const cp2X = toX - toDir * tension;
              const cp2Y = toY - laneOffset;
              arrowAngle = Math.atan2(toY - cp2Y, toX - cp2X);
              ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, toX, toY);
            };

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 0;
            ctx.strokeStyle = canvasColors.edgeUnderlay;
            ctx.lineWidth = 5.5;
            buildRelationshipPath();
            ctx.stroke();

            ctx.strokeStyle = withCanvasAlpha(canvasAccent, 'd8');
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            buildRelationshipPath();
            ctx.stroke();

            ctx.save();
            ctx.translate(toX, toY);
            ctx.rotate(arrowAngle);
            ctx.fillStyle = canvasAccent;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-11, -5);
            ctx.lineTo(-8, 0);
            ctx.lineTo(-11, 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.shadowBlur = 0;
            ctx.fillStyle = isLight ? '#ffffff' : '#0b1016';
            ctx.strokeStyle = canvasAccent;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(fromX, fromY, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(toX, toY, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = canvasAccent;
            ctx.font = '800 9px Inter, system-ui, sans-serif';
            ctx.textAlign = fromSide === 'right' ? 'left' : 'right';
            ctx.fillText('N', fromX + fromDir * 10, fromY - 9);
            ctx.textAlign = toSide === 'right' ? 'left' : 'right';
            ctx.fillText('1', toX + toDir * 10, toY - 9);
            ctx.textAlign = 'left';

            relationshipIndex += 1;
          }
        }
      });
    });

    // Draw tables
    schema.tables.forEach((table) => {
      if (table.x === undefined || table.y === undefined) return;
      const tableX = table.x;
      const tableY = table.y;
      const w = CANVAS_TABLE_WIDTH;
      const headerH = CANVAS_HEADER_HEIGHT;
      const rowH = CANVAS_ROW_HEIGHT;
      const h = canvasTableHeight(table);
      const isSelected = selectedTable === table.name;
      const tableColor = canvasAccent;

      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Card background
      const cardBg = ctx.createLinearGradient(table.x, table.y, table.x, table.y + h);
      cardBg.addColorStop(0, canvasColors.cardTop);
      cardBg.addColorStop(0.5, canvasColors.cardMid);
      cardBg.addColorStop(1, canvasColors.cardBottom);
      ctx.fillStyle = cardBg;
      ctx.beginPath();
      ctx.roundRect(table.x, table.y, w, h, 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = isSelected ? withCanvasAlpha(tableColor, 'f5') : canvasColors.cardStroke;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(table.x, table.y, w, h, 2);
      ctx.stroke();

      // Header
      const headerGrad = ctx.createLinearGradient(table.x, table.y, table.x + w, table.y + headerH);
      headerGrad.addColorStop(0, canvasColors.headerStart);
      headerGrad.addColorStop(0.5, canvasColors.headerMid);
      headerGrad.addColorStop(1, canvasColors.headerEnd);
      ctx.fillStyle = headerGrad;
      ctx.beginPath();
      ctx.roundRect(table.x, table.y, w, headerH, [2, 2, 0, 0]);
      ctx.fill();

      const colorWash = ctx.createLinearGradient(table.x, table.y, table.x + w, table.y);
      colorWash.addColorStop(0, withCanvasAlpha(tableColor, '3e'));
      colorWash.addColorStop(0.44, withCanvasAlpha(tableColor, '10'));
      colorWash.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = colorWash;
      ctx.beginPath();
      ctx.roundRect(table.x, table.y, w, headerH, [2, 2, 0, 0]);
      ctx.fill();

      ctx.fillStyle = tableColor;
      ctx.beginPath();
      ctx.roundRect(table.x, table.y, w, 3, [2, 2, 0, 0]);
      ctx.fill();

      // Bare table glyph, no icon background.
      ctx.strokeStyle = withCanvasAlpha(tableColor, 'f0');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(table.x + 18, table.y + 15, 18, 18, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(table.x + 18, table.y + 21);
      ctx.lineTo(table.x + 36, table.y + 21);
      ctx.moveTo(table.x + 24, table.y + 15);
      ctx.lineTo(table.x + 24, table.y + 33);
      ctx.stroke();

      // Table name
      ctx.fillStyle = canvasColors.title;
      ctx.font = '700 14px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(table.name, 168), table.x + 48, table.y + headerH / 2);

      const countLabel = `${table.columns.length} cols`;
      ctx.font = '700 10px Inter, system-ui, sans-serif';
      const countW = Math.max(48, ctx.measureText(countLabel).width + 18);
      ctx.fillStyle = isLight ? 'rgba(255,255,255,0.72)' : 'rgba(15, 23, 42, 0.54)';
      ctx.beginPath();
      ctx.roundRect(table.x + w - countW - 14, table.y + 14, countW, 20, 2);
      ctx.fill();
      ctx.strokeStyle = isLight ? 'rgba(71,85,105,0.16)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isLight ? '#475569' : 'rgba(226,232,240,0.82)';
      ctx.textAlign = 'right';
      ctx.fillText(countLabel, table.x + w - 22, table.y + headerH / 2);
      ctx.textAlign = 'left';

      table.columns.forEach((col, i) => {
        const rowTop = tableY + headerH + i * rowH;
        const rowMid = rowTop + rowH / 2;
        const markerColor = canvasAccent;
        const markerLabel = col.pk ? 'PK' : col.fk ? 'FK' : col.unique ? 'UQ' : col.indexed ? 'IX' : '';

        ctx.fillStyle = i % 2 === 0 ? canvasColors.rowEven : canvasColors.rowOdd;
        ctx.fillRect(tableX + 1, rowTop, w - 2, rowH);

        if (col.fk) {
          ctx.fillStyle = withCanvasAlpha(canvasAccent, isLight ? '0c' : '10');
          ctx.fillRect(tableX + 1, rowTop, w - 2, rowH);
        }

        ctx.strokeStyle = canvasColors.rowLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tableX + 14, rowTop);
        ctx.lineTo(tableX + w - 14, rowTop);
        ctx.stroke();

        if (markerLabel) {
          ctx.fillStyle = withCanvasAlpha(markerColor, '18');
          ctx.strokeStyle = withCanvasAlpha(markerColor, '55');
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tableX + 14, rowTop + 7, 26, 16, 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = markerColor;
          ctx.font = '800 8.5px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(markerLabel, tableX + 27, rowMid + 0.5);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = 'rgba(148,163,184,0.38)';
          ctx.beginPath();
          ctx.arc(tableX + 27, rowMid, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.font = '600 12px "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.fillStyle = canvasColors.body;
        ctx.fillText(fitText(col.name, 122), tableX + 50, rowMid);

        ctx.fillStyle = col.nullable ? '#64748b' : '#8b99a8';
        ctx.font = '500 11px "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(fitText(col.type, 92), tableX + w - 18, rowMid);
        ctx.textAlign = 'left';

        if (col.fk || col.pk) {
          ctx.fillStyle = markerColor;
          ctx.beginPath();
          ctx.arc(tableX + w - 6, rowMid, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.strokeStyle = canvasColors.rowLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(table.x + 14, table.y + h - CANVAS_TABLE_FOOTER);
      ctx.lineTo(table.x + w - 14, table.y + h - CANVAS_TABLE_FOOTER);
      ctx.stroke();

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = withCanvasAlpha(tableColor, 'f5');
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(table.x - 6, table.y - 6, w + 12, h + 12, 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });

    ctx.restore();
  }, [schema, theme, selectedTable, pan, zoom, showCategories]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    const canvas = canvasRef.current;
    const observer = canvas && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    if (canvas) observer?.observe(canvas);
    window.addEventListener('resize', handleResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleCanvasWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      setZoom((current) => Math.max(0.3, Math.min(3, current * delta)));
    };
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleCanvasWheel);
  }, []);

  // Get the complete category region for hit testing. Tables retain priority,
  // while any open space, padding, or the category header can move the group.
  const getCategoryBounds = (): { id: string; x: number; y: number; width: number; height: number }[] => {
    if (!showCategories || !schema.categories) return [];
    const bounds: { id: string; x: number; y: number; width: number; height: number }[] = [];

    schema.categories.forEach((category) => {
      const tablesInCategory = schema.tables.filter(t => t.category === category.id);
      if (tablesInCategory.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      tablesInCategory.forEach(table => {
        if (table.x === undefined || table.y === undefined) return;
        const tableW = CANVAS_TABLE_WIDTH;
        const tableH = canvasTableHeight(table);
        minX = Math.min(minX, table.x);
        minY = Math.min(minY, table.y);
        maxX = Math.max(maxX, table.x + tableW);
        maxY = Math.max(maxY, table.y + tableH);
      });

      if (minX === Infinity) return;

      const padding = 30;
      const labelHeight = 28;
      bounds.push({
        id: category.id,
        x: minX - padding,
        y: minY - padding - labelHeight,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2 + labelHeight,
      });
    });

    return bounds;
  };

  const getTableAt = (clientX: number, clientY: number): Table | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;

    for (const table of schema.tables) {
      if (table.x === undefined || table.y === undefined) continue;
      const w = CANVAS_TABLE_WIDTH;
      const h = canvasTableHeight(table);
      if (x >= table.x && x <= table.x + w && y >= table.y && y <= table.y + h) {
        return table;
      }
    }
    return null;
  };

  const getCategoryAt = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;

    const bounds = getCategoryBounds();
    for (const b of bounds) {
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        return b.id;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      const [first, second] = [...activePointersRef.current.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const midpointX = (first.x + second.x) / 2;
      const midpointY = (first.y + second.y) / 2;
      const rect = e.currentTarget.getBoundingClientRect();
      pinchRef.current = {
        distance: Math.max(distance, 1),
        startZoom: zoom,
        worldX: (midpointX - rect.left - pan.x) / zoom,
        worldY: (midpointY - rect.top - pan.y) / zoom,
      };
      setDragging(null);
      return;
    }

    if (activePointersRef.current.size > 1) return;
    // Tables remain individually draggable even though they sit inside the
    // larger category hit region.
    const table = getTableAt(e.clientX, e.clientY);
    if (table) {
      setDragging({ type: 'table', tableName: table.name, startX: e.clientX, startY: e.clientY });
      onSelectTable(table.name);
      return;
    }

    const categoryId = getCategoryAt(e.clientX, e.clientY);
    if (categoryId && onMoveCategory) {
      setDragging({ type: 'category', categoryId, startX: e.clientX, startY: e.clientY });
      return;
    }

    setDragging({ type: 'pan', startX: e.clientX, startY: e.clientY });
    onSelectTable(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (activePointersRef.current.size >= 2 && pinchRef.current) {
      const [first, second] = [...activePointersRef.current.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const midpointX = (first.x + second.x) / 2;
      const midpointY = (first.y + second.y) / 2;
      const rect = e.currentTarget.getBoundingClientRect();
      const nextZoom = Math.max(0.25, Math.min(3, pinchRef.current.startZoom * distance / pinchRef.current.distance));
      setZoom(nextZoom);
      setPan({
        x: midpointX - rect.left - pinchRef.current.worldX * nextZoom,
        y: midpointY - rect.top - pinchRef.current.worldY * nextZoom,
      });
      return;
    }
    if (!dragging) {
      setHoveringCategory(!getTableAt(e.clientX, e.clientY) && !!getCategoryAt(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;

    if (dragging.type === 'pan') {
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (dragging.type === 'table' && dragging.tableName) {
      const table = schema.tables.find((t) => t.name === dragging.tableName);
      if (table && table.x !== undefined && table.y !== undefined) {
        onMoveTable(dragging.tableName, table.x + dx / zoom, table.y + dy / zoom);
      }
    } else if (dragging.type === 'category' && dragging.categoryId && onMoveCategory) {
      onMoveCategory(dragging.categoryId, dx / zoom, dy / zoom);
    }
    setDragging({ ...dragging, startX: e.clientX, startY: e.clientY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
    setDragging(null);
  };

  const fitSchemaToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !schema.tables.length) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const positioned = schema.tables.filter((table) => table.x !== undefined && table.y !== undefined);
    if (!positioned.length) return;
    const minX = Math.min(...positioned.map((table) => table.x!)) - 46;
    const minY = Math.min(...positioned.map((table) => table.y!)) - 74;
    const maxX = Math.max(...positioned.map((table) => table.x! + CANVAS_TABLE_WIDTH)) + 46;
    const maxY = Math.max(...positioned.map((table) => table.y! + canvasTableHeight(table))) + 46;
    const rect = canvas.getBoundingClientRect();
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const nextZoom = Math.max(0.25, Math.min(1.2, Math.min((rect.width - 40) / contentWidth, (rect.height - 100) / contentHeight)));
    setZoom(nextZoom);
    setPan({
      x: (rect.width - contentWidth * nextZoom) / 2 - minX * nextZoom,
      y: (rect.height - contentHeight * nextZoom) / 2 - minY * nextZoom,
    });
  };

  useEffect(() => {
    if (fitSignal !== 'canvas' || !window.matchMedia?.('(max-width: 920px)').matches || !schema.tables.length) return;
    const signature = `${schema.name || ''}:${schema.tables.length}`;
    if (lastMobileFitRef.current === signature) return;
    lastMobileFitRef.current = signature;
    const frame = window.requestAnimationFrame(() => fitSchemaToCanvas());
    return () => window.cancelAnimationFrame(frame);
  }, [fitSignal, schema.name, schema.tables.length]);

  return (
    <div className="sv-canvas-surface">
      <canvas
        ref={canvasRef}
        className="block size-full touch-none"
        style={{ cursor: dragging ? 'grabbing' : hoveringCategory ? 'move' : 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') {
            activePointersRef.current.delete(event.pointerId);
            setDragging(null);
            setHoveringCategory(false);
          }
        }}
      />
      <div className="sv-zoom-controls" aria-label="Canvas zoom controls">
        <button onClick={() => setZoom((current) => Math.max(0.25, current - 0.1))} title="Zoom out" aria-label="Zoom out">
          <MinusCircleIcon size={16} weight="Linear" />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((current) => Math.min(3, current + 0.1))} title="Zoom in" aria-label="Zoom in">
          <AddCircleIcon size={16} weight="Linear" />
        </button>
        <button onClick={fitSchemaToCanvas} title="Fit schema to screen">Fit</button>
      </div>
    </div>
  );
}
