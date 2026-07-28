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

async function loadWorkbook(input = sheet): Promise<JSZip> {
  const blob = await createXlsxBlob(input);
  return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('safe XLSX export', () => {
  it('creates a complete one-sheet OOXML package', async () => {
    const archive = await loadWorkbook();
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
    const archive = await loadWorkbook();
    const worksheet = await archive.file('xl/worksheets/sheet1.xml')!.async('string');

    expect(worksheet).toContain('标题 &lt;安全&gt; &amp; &quot;验证&quot;');
    expect(worksheet).toContain('<mergeCell ref="A1:J1"/>');
    expect(worksheet).toContain('<mergeCell ref="A5:J5"/>');
    expect(worksheet).toContain('=HYPERLINK(&quot;https://evil.example&quot;)');
    expect(worksheet).not.toContain('<f>');
    expect(worksheet).toContain('<c r="C8"><v>23.5</v></c>');
  });

  it('sanitizes and limits the worksheet name', async () => {
    const archive = await loadWorkbook();
    const workbook = await archive.file('xl/workbook.xml')!.async('string');
    const match = workbook.match(/<sheet name="([^"]+)"/);

    expect(match?.[1]).not.toMatch(/[\\/?*[\]:]/);
    expect(match?.[1].length).toBeLessThanOrEqual(31);
  });

  it('uses the safe default name when sanitization removes the whole sheet name', async () => {
    const archive = await loadWorkbook({
      ...sheet,
      name: '///:::***',
    });
    const workbook = await archive.file('xl/workbook.xml')!.async('string');

    expect(workbook).toContain('<sheet name="监测数据"');
  });

  it('downloads the generated XLSX under the requested filename', async () => {
    const save = vi.fn();
    await saveXlsxFile(sheet, '监测报表.xlsx', save);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(save.mock.calls[0][1]).toBe('监测报表.xlsx');
  });
});
