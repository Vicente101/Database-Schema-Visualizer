import type { Schema, Table } from '../../types/workspace';

export async function downloadPowerPoint(schema: Schema): Promise<string> {
  if (schema.tables.length === 0) {
    throw new Error('No tables are available to export.');
  }

    try {
      // Load JSZip for creating the PPTX file (which is just a ZIP)
      const JSZip = await new Promise<any>((resolve, reject) => {
        if ((window as any).JSZip) {
          resolve((window as any).JSZip);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => {
          setTimeout(() => {
            if ((window as any).JSZip) {
              resolve((window as any).JSZip);
            } else {
              reject(new Error('JSZip failed to initialize'));
            }
          }, 50);
        };
        script.onerror = () => reject(new Error('Failed to load JSZip library'));
        document.head.appendChild(script);
      });

      // Count relationships
      const relationships: Array<{ from: string; fromCol: string; to: string; toCol: string }> = [];
      schema.tables.forEach(t => {
        t.columns.forEach(c => {
          if (c.fk) {
            relationships.push({ from: t.name, fromCol: c.name, to: c.fk.table, toCol: c.fk.column });
          }
        });
      });
      const categoryOrder = new Map((schema.categories || []).map((category, index) => [category.id, index]));
      const categoryName = (table: Table) =>
        (schema.categories || []).find((category) => category.id === table.category)?.name || 'Uncategorized';
      const presentationTables = [...schema.tables].sort((a, b) => {
        const categoryA = a.category ? (categoryOrder.get(a.category) ?? 999) : 999;
        const categoryB = b.category ? (categoryOrder.get(b.category) ?? 999) : 999;
        return categoryA - categoryB || categoryName(a).localeCompare(categoryName(b)) || a.name.localeCompare(b.name);
      });
      relationships.sort(
        (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.fromCol.localeCompare(b.fromCol),
      );

      // Helper to escape XML
      const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      // EMU conversions (914400 EMUs per inch)
      const inchToEmu = (inches: number) => Math.round(inches * 914400);
      const SLIDE_W = inchToEmu(10);
      const SLIDE_H = inchToEmu(7.5);

      // Color helper
      const hexColor = (hex: string) => hex.replace('#', '').toUpperCase();

      // Generate slide XML
      const createSlideXml = (content: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    ${content}
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;

      // Create rectangle shape
      const createRect = (x: number, y: number, w: number, h: number, fillColor: string, id: number) => `
<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rect${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${inchToEmu(x)}" y="${inchToEmu(y)}"/><a:ext cx="${inchToEmu(w)}" cy="${inchToEmu(h)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${hexColor(fillColor)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>`;

      // Create text box
      const createTextBox = (x: number, y: number, w: number, h: number, text: string, fontSize: number, color: string, bold: boolean, align: string, id: number) => `
<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${inchToEmu(x)}" y="${inchToEmu(y)}"/><a:ext cx="${inchToEmu(w)}" cy="${inchToEmu(h)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="ctr"/><a:lstStyle/>
<a:p><a:pPr algn="${align === 'center' ? 'ctr' : align === 'right' ? 'r' : 'l'}"/>
  <a:r><a:rPr lang="en-US" sz="${fontSize * 100}"${bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${hexColor(color)}"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr>
<a:t>${escXml(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;

      const colors = {
        dark: '15212B',
        darkAlt: '24323D',
        primary: '617989',
        secondary: '617989',
        accent: '617989',
        light: 'F5F7F8',
        muted: '83919B',
        warning: '617989',
        canvas: 'EEF2F4',
        paper: 'FFFFFF',
        panel: 'E2E8EC',
        text: '1C2932',
        line: 'C5D0D7',
      };

      const slides: string[] = [];

      // ═══════════════════════════════════════════════════════════════════════════
      // SLIDE 1: Title Slide
      // ═══════════════════════════════════════════════════════════════════════════
      let slide1Content = '';
      let id = 2;
      slide1Content += createRect(0, 0, 10, 7.5, colors.dark, id++);
      slide1Content += createRect(0.45, 0.42, 9.1, 0.02, colors.line, id++);
      slide1Content += createRect(0.45, 7.04, 9.1, 0.02, colors.line, id++);
      slide1Content += createRect(0.45, 0.42, 0.02, 6.64, colors.line, id++);
      slide1Content += createRect(9.53, 0.42, 0.02, 6.64, colors.line, id++);
      slide1Content += createTextBox(0.72, 0.82, 8.5, 0.32, 'DATABASE ARCHITECTURE', 10, colors.muted, true, 'left', id++);
      slide1Content += createTextBox(0.72, 1.38, 8.55, 1.22, schema.name || 'Database Schema', 36, colors.light, true, 'left', id++);
      slide1Content += createTextBox(0.72, 2.62, 8.5, 0.46, 'Schema specification and relationship documentation', 16, colors.muted, false, 'left', id++);
      slide1Content += createRect(0.72, 3.36, 8.55, 0.03, colors.primary, id++);
      const totalColumns = schema.tables.reduce((a, t) => a + t.columns.length, 0);
      slide1Content += createTextBox(0.72, 3.72, 2.4, 0.28, 'TABLES', 9, colors.muted, true, 'left', id++);
      slide1Content += createTextBox(0.72, 4.02, 2.4, 0.58, String(schema.tables.length), 25, colors.light, true, 'left', id++);
      slide1Content += createTextBox(3.34, 3.72, 2.4, 0.28, 'COLUMNS', 9, colors.muted, true, 'left', id++);
      slide1Content += createTextBox(3.34, 4.02, 2.4, 0.58, String(totalColumns), 25, colors.light, true, 'left', id++);
      slide1Content += createTextBox(5.96, 3.72, 2.8, 0.28, 'RELATIONSHIPS', 9, colors.muted, true, 'left', id++);
      slide1Content += createTextBox(5.96, 4.02, 2.8, 0.58, String(relationships.length), 25, colors.light, true, 'left', id++);
      slide1Content += createTextBox(0.72, 6.38, 8.55, 0.3, new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 9, colors.muted, false, 'left', id++);
      slides.push(createSlideXml(slide1Content));

      // ═══════════════════════════════════════════════════════════════════════════
      // SLIDE 2: Schema Overview
      // ═══════════════════════════════════════════════════════════════════════════
      const overviewPageSize = 12;
      const overviewPageCount = Math.ceil(presentationTables.length / overviewPageSize);
      Array.from({ length: overviewPageCount }).forEach((_, pageIndex) => {
        let slide2Content = '';
        id = 2;
        slide2Content += createRect(0, 0, 10, 7.5, colors.canvas, id++);
        slide2Content += createRect(0, 0, 10, 0.16, colors.dark, id++);
        slide2Content += createTextBox(
          0.45,
          0.34,
          7.5,
          0.46,
          overviewPageCount > 1 ? `Schema Overview · ${pageIndex + 1}/${overviewPageCount}` : 'Schema Overview',
          22,
          colors.text,
          true,
          'left',
          id++,
        );
        slide2Content += createTextBox(0.45, 0.75, 8.8, 0.25, 'Tables grouped by business domain and dependency context', 9, colors.muted, false, 'left', id++);

        const pageTables = presentationTables.slice(
          pageIndex * overviewPageSize,
          (pageIndex + 1) * overviewPageSize,
        );
        const gridCols = 3;
        const tableBoxWidth = 2.9;
        const tableBoxHeight = 1.18;
        const gridStartX = 0.45;
        pageTables.forEach((table, index) => {
          const col = index % gridCols;
          const row = Math.floor(index / gridCols);
          const x = gridStartX + col * 3.08;
          const y = 1.04 + row * 1.34;
          slide2Content += createRect(x, y, tableBoxWidth, tableBoxHeight, colors.paper, id++);
          slide2Content += createRect(x, y, 0.07, tableBoxHeight, colors.primary, id++);
          slide2Content += createTextBox(x + 0.18, y + 0.13, 2.55, 0.32, table.name, 12, colors.text, true, 'left', id++);
          slide2Content += createTextBox(x + 0.18, y + 0.48, 2.55, 0.25, categoryName(table), 8, colors.primary, true, 'left', id++);
          slide2Content += createTextBox(
            x + 0.18,
            y + 0.77,
            2.55,
            0.23,
            `${table.columns.length} columns · ${table.columns.filter((column) => column.fk).length} foreign keys`,
            8,
            colors.muted,
            false,
            'left',
            id++,
          );
        });

        slide2Content += createTextBox(
          0.45,
          6.72,
          9.1,
          0.34,
          `${schema.tables.length} tables  ·  ${schema.tables.reduce((a, t) => a + t.columns.length, 0)} columns  ·  ${relationships.length} relationships  ·  ${(schema.categories || []).length} domains`,
          10,
          colors.text,
          false,
          'left',
          id++,
        );
        slides.push(createSlideXml(slide2Content));
      });

      // ═══════════════════════════════════════════════════════════════════════════
      // SLIDE 3: Relationships (if any)
      // ═══════════════════════════════════════════════════════════════════════════
      if (relationships.length > 0) {
        const relationshipPageSize = 13;
        const relationshipPageCount = Math.ceil(relationships.length / relationshipPageSize);

        Array.from({ length: relationshipPageCount }).forEach((_, relationshipPageIndex) => {
          const relationshipStart = relationshipPageIndex * relationshipPageSize;
          const pageRelationships = relationships.slice(
            relationshipStart,
            relationshipStart + relationshipPageSize,
          );
          let slide3Content = '';
          id = 2;
          slide3Content += createRect(0, 0, 10, 7.5, colors.canvas, id++);
          slide3Content += createRect(0, 0, 10, 0.16, colors.dark, id++);
          slide3Content += createTextBox(0.5, 0.34, 8, 0.5, 'Table Relationships', 22, colors.text, true, 'left', id++);
          slide3Content += createTextBox(0.5, 0.76, 8.8, 0.25, 'Foreign-key paths documented from source to target', 9, colors.muted, false, 'left', id++);
          if (relationshipPageCount > 1) {
            slide3Content += createTextBox(
              8.0,
              0.42,
              1.1,
              0.3,
              `${relationshipPageIndex + 1}/${relationshipPageCount}`,
              9,
              colors.muted,
              true,
              'right',
              id++,
            );
          }

          let yPos = 1.2;
          slide3Content += createRect(0.5, yPos, 2.2, 0.4, colors.darkAlt, id++);
          slide3Content += createTextBox(0.5, yPos, 2.2, 0.4, 'From Table', 10, colors.light, true, 'center', id++);
          slide3Content += createRect(2.7, yPos, 1.8, 0.4, colors.darkAlt, id++);
          slide3Content += createTextBox(2.7, yPos, 1.8, 0.4, 'Column', 10, colors.light, true, 'center', id++);
          slide3Content += createRect(4.5, yPos, 0.6, 0.4, colors.darkAlt, id++);
          slide3Content += createTextBox(4.5, yPos, 0.6, 0.4, '->', 10, colors.muted, false, 'center', id++);
          slide3Content += createRect(5.1, yPos, 2.2, 0.4, colors.darkAlt, id++);
          slide3Content += createTextBox(5.1, yPos, 2.2, 0.4, 'To Table', 10, colors.light, true, 'center', id++);
          slide3Content += createRect(7.3, yPos, 1.8, 0.4, colors.darkAlt, id++);
          slide3Content += createTextBox(7.3, yPos, 1.8, 0.4, 'Column', 10, colors.light, true, 'center', id++);
          yPos += 0.45;

          pageRelationships.forEach((rel, idx) => {
            const bgColor = idx % 2 === 0 ? colors.paper : colors.panel;
            slide3Content += createRect(0.5, yPos, 2.2, 0.35, bgColor, id++);
            slide3Content += createTextBox(0.5, yPos, 2.2, 0.35, rel.from, 9, colors.text, false, 'center', id++);
            slide3Content += createRect(2.7, yPos, 1.8, 0.35, bgColor, id++);
            slide3Content += createTextBox(2.7, yPos, 1.8, 0.35, rel.fromCol, 9, colors.accent, false, 'center', id++);
            slide3Content += createRect(4.5, yPos, 0.6, 0.35, bgColor, id++);
            slide3Content += createTextBox(4.5, yPos, 0.6, 0.35, '->', 9, colors.muted, false, 'center', id++);
            slide3Content += createRect(5.1, yPos, 2.2, 0.35, bgColor, id++);
            slide3Content += createTextBox(5.1, yPos, 2.2, 0.35, rel.to, 9, colors.text, false, 'center', id++);
            slide3Content += createRect(7.3, yPos, 1.8, 0.35, bgColor, id++);
            slide3Content += createTextBox(7.3, yPos, 1.8, 0.35, rel.toCol, 9, colors.accent, false, 'center', id++);
            yPos += 0.38;
          });

          slide3Content += createTextBox(
            0.5,
            6.86,
            8.6,
            0.24,
            `Relationships ${relationshipStart + 1}-${relationshipStart + pageRelationships.length} of ${relationships.length}`,
            8,
            colors.muted,
            false,
            'right',
            id++,
          );
          slides.push(createSlideXml(slide3Content));
        });
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // TABLE DETAIL SLIDES
      // ═══════════════════════════════════════════════════════════════════════════
      presentationTables.forEach((table, tableIdx) => {
        const pkCount = table.columns.filter(c => c.pk).length;
        const fkCount = table.columns.filter(c => c.fk).length;
        const columnPageSize = 12;
        const columnPageCount = Math.max(1, Math.ceil(table.columns.length / columnPageSize));

        Array.from({ length: columnPageCount }).forEach((_, columnPageIndex) => {
          const columnStart = columnPageIndex * columnPageSize;
          const pageColumns = table.columns.slice(columnStart, columnStart + columnPageSize);
          let slideContent = '';
          id = 2;

          slideContent += createRect(0, 0, 10, 7.5, colors.canvas, id++);
          slideContent += createRect(0, 0, 10, 0.16, colors.dark, id++);
          slideContent += createTextBox(0.4, 0.34, 7, 0.5, table.name, 23, colors.text, true, 'left', id++);
          slideContent += createTextBox(
            6.65,
            0.38,
            2.95,
            0.35,
            `${categoryName(table)} · ${tableIdx + 1}/${presentationTables.length}${columnPageCount > 1 ? ` · page ${columnPageIndex + 1}/${columnPageCount}` : ''}`,
            9,
            colors.muted,
            false,
            'right',
            id++,
          );

          slideContent += createRect(0.4, 1.0, 4.4, 0.6, colors.paper, id++);
          slideContent += createTextBox(0.5, 1.05, 4.2, 0.5, `Columns: ${table.columns.length}  |  Primary keys: ${pkCount}  |  Foreign keys: ${fkCount}`, 10, colors.text, false, 'left', id++);
          slideContent += createTextBox(0.4, 1.8, 9, 0.3, 'Column specification', 12, colors.text, true, 'left', id++);

          let yPos = 2.2;
          slideContent += createRect(0.4, yPos, 2.5, 0.35, colors.dark, id++);
          slideContent += createTextBox(0.4, yPos, 2.5, 0.35, 'Column Name', 10, 'FFFFFF', true, 'center', id++);
          slideContent += createRect(2.9, yPos, 2.0, 0.35, colors.dark, id++);
          slideContent += createTextBox(2.9, yPos, 2.0, 0.35, 'Data Type', 10, 'FFFFFF', true, 'center', id++);
          slideContent += createRect(4.9, yPos, 2.5, 0.35, colors.dark, id++);
          slideContent += createTextBox(4.9, yPos, 2.5, 0.35, 'Constraints', 10, 'FFFFFF', true, 'center', id++);
          slideContent += createRect(7.4, yPos, 2.2, 0.35, colors.dark, id++);
          slideContent += createTextBox(7.4, yPos, 2.2, 0.35, 'References', 10, 'FFFFFF', true, 'center', id++);
          yPos += 0.38;

          pageColumns.forEach((col, idx) => {
            const bgColor = idx % 2 === 0 ? colors.paper : colors.panel;
            const constraints: string[] = [];
            if (col.pk) constraints.push('PK');
            if (col.unique && !col.pk) constraints.push('UQ');
            if (col.indexed && !col.pk && !col.unique) constraints.push('INDEX');
            if (col.nullable === false) constraints.push('NOT NULL');

            slideContent += createRect(0.4, yPos, 2.5, 0.32, bgColor, id++);
            slideContent += createTextBox(0.4, yPos, 2.5, 0.32, col.name, 9, col.pk ? colors.primary : colors.text, col.pk, 'center', id++);
            slideContent += createRect(2.9, yPos, 2.0, 0.32, bgColor, id++);
            slideContent += createTextBox(2.9, yPos, 2.0, 0.32, col.type, 9, colors.accent, false, 'center', id++);
            slideContent += createRect(4.9, yPos, 2.5, 0.32, bgColor, id++);
            slideContent += createTextBox(4.9, yPos, 2.5, 0.32, constraints.join(', ') || '-', 8, colors.muted, false, 'center', id++);
            slideContent += createRect(7.4, yPos, 2.2, 0.32, bgColor, id++);
            slideContent += createTextBox(7.4, yPos, 2.2, 0.32, col.fk ? `${col.fk.table}.${col.fk.column}` : '-', 8, col.fk ? colors.accent : colors.muted, false, 'center', id++);
            yPos += 0.34;
          });

          const columnRangeLabel = pageColumns.length > 0
            ? `Columns ${columnStart + 1}-${columnStart + pageColumns.length} of ${table.columns.length}`
            : 'No columns defined';
          slideContent += createTextBox(0.4, 6.86, 9.2, 0.24, columnRangeLabel, 8, colors.muted, false, 'right', id++);
          slides.push(createSlideXml(slideContent));
        });
      });

      // ═══════════════════════════════════════════════════════════════════════════
      // FINAL SLIDE: Summary
      // ═══════════════════════════════════════════════════════════════════════════
      let finalContent = '';
      id = 2;
      finalContent += createRect(0, 0, 10, 7.5, colors.dark, id++);
      finalContent += createRect(0.52, 0.52, 8.96, 0.02, colors.line, id++);
      finalContent += createRect(0.52, 6.96, 8.96, 0.02, colors.line, id++);
      finalContent += createTextBox(0.75, 1.48, 8.5, 0.32, 'SCHEMA DOCUMENTATION', 10, colors.muted, true, 'center', id++);
      finalContent += createTextBox(0.75, 2.02, 8.5, 0.76, 'Architecture documented', 32, colors.light, true, 'center', id++);
      finalContent += createRect(3.7, 3.06, 2.6, 0.03, colors.primary, id++);
      finalContent += createTextBox(0.75, 3.42, 8.5, 0.5, `${schema.tables.length} tables  ·  ${schema.tables.reduce((a, t) => a + t.columns.length, 0)} columns  ·  ${relationships.length} relationships`, 13, colors.light, false, 'center', id++);
      finalContent += createTextBox(0.75, 5.52, 8.5, 0.34, 'Generated by Schema Visualizer', 10, colors.muted, false, 'center', id++);
      finalContent += createTextBox(0.75, 5.88, 8.5, 0.28, new Date().toLocaleString(), 9, colors.muted, false, 'center', id++);
      slides.push(createSlideXml(finalContent));

      // ═══════════════════════════════════════════════════════════════════════════
      // BUILD PPTX PACKAGE
      // ═══════════════════════════════════════════════════════════════════════════
      const zip = new JSZip();

      // [Content_Types].xml
      let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`;
      slides.forEach((_, i) => {
        contentTypes += `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      });
      contentTypes += `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;
      zip.file('[Content_Types].xml', contentTypes);

      // _rels/.rels
      zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

      // ppt/presentation.xml
      let slideIdList = '';
      let slideRelList = '';
      slides.forEach((_, i) => {
        slideIdList += `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`;
        slideRelList += `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`;
      });
      zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${slideIdList}</p:sldIdLst>
<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/>
<p:notesSz cx="${SLIDE_H}" cy="${SLIDE_W}"/>
</p:presentation>`);

      // ppt/_rels/presentation.xml.rels
      zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRelList}
</Relationships>`);

      // Add slides
      slides.forEach((slideXml, i) => {
        zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml);
        zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);
      });

      // Slide master and layout
      zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);

      zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);

      zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);

      zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

      // Theme
      zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Schema Documentation">
<a:themeElements>
<a:clrScheme name="Schema Neutral"><a:dk1><a:srgbClr val="15212B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="24323D"/></a:dk2><a:lt2><a:srgbClr val="EEF2F4"/></a:lt2>
<a:accent1><a:srgbClr val="617989"/></a:accent1><a:accent2><a:srgbClr val="708591"/></a:accent2>
<a:accent3><a:srgbClr val="83949F"/></a:accent3><a:accent4><a:srgbClr val="96A5AE"/></a:accent4>
<a:accent5><a:srgbClr val="AAB5BC"/></a:accent5><a:accent6><a:srgbClr val="C5D0D7"/></a:accent6>
<a:hlink><a:srgbClr val="4D697A"/></a:hlink><a:folHlink><a:srgbClr val="617989"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Aptos"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements></a:theme>`);

      // Generate and download
      const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const fileName = `${(schema.name || 'schema').replace(/[^a-zA-Z0-9]/g, '_')}_documentation.pptx`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      return fileName;


    } catch (error) {
      console.error('PowerPoint export error:', error);
      throw error;
    }
}
