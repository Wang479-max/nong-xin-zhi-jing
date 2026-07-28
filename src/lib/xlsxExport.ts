import saveAs from 'file-saver';
import JSZip from 'jszip';

export type XlsxCellValue = string | number | null | undefined;

export interface XlsxSheet {
  name: string;
  rows: XlsxCellValue[][];
  merges?: string[];
  columnWidths?: number[];
}

type SaveFile = (data: Blob, filename: string) => void;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MERGE_REFERENCE = /^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/;

export async function createXlsxBlob(sheet: XlsxSheet): Promise<Blob> {
  const zip = new JSZip();
  const safeName = sanitizeSheetName(sheet.name);
  const merges = (sheet.merges ?? []).filter((reference) => MERGE_REFERENCE.test(reference));

  zip.file('[Content_Types].xml', contentTypesXml());
  zip.file('_rels/.rels', rootRelationshipsXml());
  zip.file('docProps/app.xml', appPropertiesXml());
  zip.file('docProps/core.xml', corePropertiesXml());
  zip.file('xl/workbook.xml', workbookXml(safeName));
  zip.file('xl/_rels/workbook.xml.rels', workbookRelationshipsXml());
  zip.file('xl/styles.xml', stylesXml());
  zip.file('xl/worksheets/sheet1.xml', worksheetXml(sheet.rows, merges, sheet.columnWidths ?? []));

  return zip.generateAsync({
    type: 'blob',
    mimeType: XLSX_MIME,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function saveXlsxFile(
  sheet: XlsxSheet,
  filename: string,
  saveFile: SaveFile = (data, name) => saveAs(data, name),
): Promise<void> {
  const blob = await createXlsxBlob(sheet);
  saveFile(blob, filename);
}

function worksheetXml(
  rows: XlsxCellValue[][],
  merges: string[],
  columnWidths: number[],
): string {
  const maxDataColumn = Math.max(1, ...rows.map((row) => row.length));
  const maxMergeColumn = Math.max(1, ...merges.map(maxColumnInMerge));
  const maxColumn = Math.max(maxDataColumn, maxMergeColumn);
  const maxRow = Math.max(1, rows.length);
  const dimension = `A1:${columnName(maxColumn - 1)}${maxRow}`;
  const columns = columnWidths
    .map((width, index) => (
      Number.isFinite(width) && width > 0
        ? `<col min="${index + 1}" max="${index + 1}" width="${Math.min(width, 255)}" customWidth="1"/>`
        : ''
    ))
    .join('');
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => cellXml(value, rowIndex, columnIndex))
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  const mergeXml = merges.length > 0
    ? `<mergeCells count="${merges.length}">${merges
      .map((reference) => `<mergeCell ref="${reference}"/>`)
      .join('')}</mergeCells>`
    : '';

  return `${XML_DECLARATION}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  ${columns ? `<cols>${columns}</cols>` : ''}
  <sheetData>${rowXml}</sheetData>
  ${mergeXml}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function cellXml(
  value: XlsxCellValue,
  row: number,
  column: number,
): string {
  if (value === null || value === undefined) return '';
  const reference = `${columnName(column)}${row + 1}`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function sanitizeSheetName(value: string): string {
  const cleaned = value
    .replace(/[\\/?*[\]:]/g, '')
    .trim()
    .slice(0, 31);
  return cleaned || '监测数据';
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function maxColumnInMerge(reference: string): number {
  const endCell = reference.split(':')[1];
  const letters = endCell.match(/^[A-Z]+/)?.[0] ?? 'A';
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function contentTypesXml(): string {
  return `${XML_DECLARATION}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function rootRelationshipsXml(): string {
  return `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function workbookRelationshipsXml(): string {
  return `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function workbookXml(sheetName: string): string {
  return `${XML_DECLARATION}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews>
  <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function stylesXml(): string {
  return `${XML_DECLARATION}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="0"/>
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function appPropertiesXml(): string {
  return `${XML_DECLARATION}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>农芯智境</Application>
  <AppVersion>1.0</AppVersion>
</Properties>`;
}

function corePropertiesXml(): string {
  return `${XML_DECLARATION}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>农芯智境</dc:creator>
  <cp:lastModifiedBy>农芯智境</cp:lastModifiedBy>
</cp:coreProperties>`;
}
