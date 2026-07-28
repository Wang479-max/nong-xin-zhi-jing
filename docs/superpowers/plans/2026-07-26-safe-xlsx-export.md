# Safe XLSX Export Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unpatched high-risk `xlsx` dependency while preserving the existing browser download of a standard `.xlsx` monitoring report.

**Architecture:** Add one focused OOXML writer in `src/lib/xlsxExport.ts`. It will serialize a single worksheet with inline strings, finite numeric cells, merges, and widths; `JSZip` will package the fixed workbook paths and `file-saver` will download the Blob. `FieldMonitoring` remains responsible for querying and formatting report data, so no page or API behavior changes.

**Tech Stack:** TypeScript, JSZip, file-saver, Vitest, Office Open XML.

---

## File map

- Create `src/lib/xlsxExport.ts`: sanitize inputs, serialize a one-sheet XLSX package, and download it.
- Create `tests/frontend/xlsxExport.test.ts`: unzip generated workbooks and verify structure, escaping, formula safety, merges, names, and download behavior.
- Modify `src/components/FieldMonitoring.tsx`: replace SheetJS calls with matrix creation and `saveXlsxFile`.
- Modify `tests/frontend/securityStatic.test.ts`: prevent reintroduction of the vulnerable package/import.
- Modify `package.json` and `package-lock.json`: remove `xlsx`; retain compatible patched transitive dependency versions from the authorized audit fix.

---

### Task 1: Define and test the safe XLSX writer

**Files:**

- Create: `tests/frontend/xlsxExport.test.ts`
- Create: `src/lib/xlsxExport.ts`

- [ ] **Step 1: Write failing workbook tests**

Create tests that call the desired API before the module exists:

```ts
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createXlsxBlob, saveXlsxFile } from '../../src/lib/xlsxExport';

const sheet = {
  name: '监测/数据:*?[]-名称很长名称很长名称很长名称很长',
  rows: [
    ['标题 <安全> & "验证"'],
    [],
    ['地块 A'],
    ['批次'],
    ['说明'],
    [],
    ['时间', '备注', '数值'],
    ['2026-07-26', '=HYPERLINK("https://evil.example")', 23.5],
  ],
  merges: ['A1:J1', 'A3:J3', 'A4:J4', 'A5:J5'],
  columnWidths: [22, 32, 14],
};

describe('safe XLSX export', () => {
  it('creates a complete one-sheet OOXML package', async () => {
    const archive = await JSZip.loadAsync(await createXlsxBlob(sheet));
    for (const name of [
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/app.xml',
      'docProps/core.xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(archive.file(name)).not.toBeNull();
    }
  });

  it('escapes XML, preserves merges, and never creates formulas from text', async () => {
    const archive = await JSZip.loadAsync(await createXlsxBlob(sheet));
    const worksheet = await archive.file('xl/worksheets/sheet1.xml')!.async('string');

    expect(worksheet).toContain('标题 &lt;安全&gt; &amp; &quot;验证&quot;');
    expect(worksheet).toContain('<mergeCell ref="A1:J1"/>');
    expect(worksheet).toContain('<mergeCell ref="A5:J5"/>');
    expect(worksheet).toContain('=HYPERLINK(&quot;https://evil.example&quot;)');
    expect(worksheet).not.toContain('<f>');
    expect(worksheet).toContain('<c r="C8"><v>23.5</v></c>');
  });

  it('sanitizes and limits the worksheet name', async () => {
    const archive = await JSZip.loadAsync(await createXlsxBlob(sheet));
    const workbook = await archive.file('xl/workbook.xml')!.async('string');
    const match = workbook.match(/<sheet name="([^"]+)"/);

    expect(match?.[1]).not.toMatch(/[\\/?*[\]:]/);
    expect(match?.[1].length).toBeLessThanOrEqual(31);
  });

  it('downloads the generated XLSX under the requested filename', async () => {
    const save = vi.fn();
    await saveXlsxFile(sheet, '监测报表.xlsx', save);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(save.mock.calls[0][1]).toBe('监测报表.xlsx');
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npx vitest run tests/frontend/xlsxExport.test.ts
```

Expected: FAIL because `src/lib/xlsxExport.ts` does not exist.

- [ ] **Step 3: Implement the minimal writer**

Create `src/lib/xlsxExport.ts` with this public contract:

```ts
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export type XlsxCellValue = string | number | null | undefined;

export interface XlsxSheet {
  name: string;
  rows: XlsxCellValue[][];
  merges?: string[];
  columnWidths?: number[];
}

type SaveFile = (data: Blob, filename: string) => void;

export async function createXlsxBlob(sheet: XlsxSheet): Promise<Blob>;

export async function saveXlsxFile(
  sheet: XlsxSheet,
  filename: string,
  saveFile: SaveFile = saveAs,
): Promise<void>;
```

Implementation requirements:

```ts
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(value: string): string {
  const cleaned = value.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31);
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

function cellXml(value: XlsxCellValue, row: number, column: number): string {
  if (value === null || value === undefined) return '';
  const ref = `${columnName(column)}${row + 1}`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}
```

Generate fixed OOXML parts for:

```text
[Content_Types].xml
_rels/.rels
docProps/app.xml
docProps/core.xml
xl/workbook.xml
xl/_rels/workbook.xml.rels
xl/styles.xml
xl/worksheets/sheet1.xml
```

The worksheet XML must:

- emit rows using one-based row numbers;
- emit `<cols>` only for positive finite widths;
- emit `<mergeCells count="N">` only when merges exist;
- write text only with `t="inlineStr"` and never emit `<f>`;
- calculate the dimension from the maximum row width, defaulting to `A1`.

Package with:

```ts
const zip = new JSZip();
// zip.file(...) for fixed paths only
return zip.generateAsync({
  type: 'blob',
  mimeType: XLSX_MIME,
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});
```

`saveXlsxFile` awaits `createXlsxBlob` and calls `saveFile(blob, filename)` exactly once.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
npx vitest run tests/frontend/xlsxExport.test.ts
npx tsc --noEmit
```

Expected: all new tests PASS and TypeScript emits no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/xlsxExport.ts tests/frontend/xlsxExport.test.ts
git commit -m "feat: add dependency-free safe xlsx writer"
```

---

### Task 2: Integrate the writer without changing the monitoring UI

**Files:**

- Modify: `src/components/FieldMonitoring.tsx:37,650-730`
- Modify: `tests/frontend/securityStatic.test.ts`

- [ ] **Step 1: Add a failing static regression test**

Add:

```ts
it('uses the safe XLSX writer instead of SheetJS', () => {
  const monitoring = read('src/components/FieldMonitoring.tsx');
  expect(monitoring).toContain("from '../lib/xlsxExport'");
  expect(monitoring).not.toMatch(/from ['"]xlsx['"]/);
  expect(monitoring).toContain('await saveXlsxFile(');
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npx vitest run tests/frontend/securityStatic.test.ts
```

Expected: FAIL because `FieldMonitoring` still imports `xlsx`.

- [ ] **Step 3: Replace only the workbook construction**

Replace:

```ts
import { utils, writeFile } from 'xlsx';
```

with:

```ts
import { saveXlsxFile } from '../lib/xlsxExport';
```

Keep the existing data query, selection logic, titles, filename, notifications, modal behavior, and error handler. Replace only the SheetJS block with:

```ts
const headers = Object.keys(exportData[0]);
const rows = [
  [headerTitle],
  [],
  [subTitle1],
  [subTitle2],
  [tipInfo],
  [],
  headers,
  ...exportData.map((row) => headers.map((header) => row[header] ?? '')),
];

await saveXlsxFile({
  name: t('monitoring.export.sheetName'),
  rows,
  merges: ['A1:J1', 'A3:J3', 'A4:J4', 'A5:J5'],
  columnWidths: headers.map((header, index) => index === 0 ? 22 : Math.max(14, Math.min(30, header.length + 4))),
}, filename);
```

- [ ] **Step 4: Run focused regression tests**

Run:

```bash
npx vitest run tests/frontend/xlsxExport.test.ts tests/frontend/securityStatic.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FieldMonitoring.tsx tests/frontend/securityStatic.test.ts
git commit -m "fix: replace vulnerable monitoring xlsx export"
```

---

### Task 3: Remove the vulnerable dependency and verify production safety

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add package-level regression assertions**

Extend the static security test:

```ts
it('does not ship the vulnerable SheetJS package', () => {
  const manifest = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>;
  };
  expect(manifest.dependencies?.xlsx).toBeUndefined();
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npx vitest run tests/frontend/securityStatic.test.ts
```

Expected: FAIL because `package.json` still lists `xlsx`.

- [ ] **Step 3: Remove SheetJS and restore development dependencies**

Run:

```bash
npm uninstall xlsx --legacy-peer-deps
npm install --legacy-peer-deps
```

The first command removes the direct dependency. The second restores development packages removed by the production-only audit fix while retaining patched compatible transitive versions in `package-lock.json`.

- [ ] **Step 4: Run the full quality gate**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org/
git diff --check
```

Expected:

- all Vitest tests PASS;
- TypeScript emits no errors;
- frontend, server, migration, and SMTP smoke bundles build;
- npm audit reports zero high or critical production vulnerabilities;
- no whitespace errors.

- [ ] **Step 5: Manually validate the generated file**

From the monitoring page, export a report with all columns enabled and verify:

1. filename still ends in `.xlsx`;
2. Microsoft Excel opens it without a repair warning;
3. WPS opens it without a repair warning;
4. title and metadata appear above row 7;
5. data headers begin at row 7;
6. all selected data columns and values are present;
7. cells beginning with `=` remain text rather than formulas.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/frontend/securityStatic.test.ts
git commit -m "fix: remove vulnerable sheetjs dependency"
```

---

## Exit criteria

- No code or lockfile reference installs `xlsx`.
- Existing monitoring Excel UI and filename behavior are unchanged.
- Generated workbook structure is covered by executable tests.
- Full tests, TypeScript, production build, and official npm production audit pass.
- The branch remains reviewable with separate writer, integration, and dependency-removal commits.
