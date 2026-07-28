import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('mobile application shell contracts', () => {
  it('mounts mobile chrome while keeping the existing header at md and above', () => {
    const source = read('src/App.tsx');

    expect(source).toContain("import MobileAppChrome");
    expect(source).toContain('<MobileAppChrome');
    expect(source).toContain('hidden h-16 md:flex');
    expect(source).toContain('data-active-tab={activeTab}');
  });

  it('declares safe-area viewport and mobile overflow helpers', () => {
    expect(read('index.html')).toContain('viewport-fit=cover');
    expect(read('src/index.css')).toContain('.mobile-scroll-row');
    expect(read('src/index.css')).toContain('.mobile-touch-target');
  });
});

describe('mobile module layout contracts', () => {
  it('uses mobile-first dashboard spacing and section anchors', () => {
    const source = read('src/components/Dashboard.tsx');

    expect(source).toContain('p-3 sm:p-6 lg:p-14');
    expect(source).toContain('id="dashboard-environment"');
    expect(source).toContain('grid-cols-2 sm:grid-cols-4');
  });

  it('exposes phone-safe monitoring and field-management sections', () => {
    const monitoring = read('src/components/FieldMonitoring.tsx');
    const management = read('src/components/FieldManagement.tsx');

    expect(monitoring).toContain('id="monitoring-trends"');
    expect(monitoring).toContain('grid-cols-2 sm:grid-cols-3');
    expect(management).toContain('id="management-fields"');
    expect(management).toContain('grid-cols-1 sm:grid-cols-2 md:grid-cols-4');
  });

  it('uses a vertical AI workflow and mobile record cards', () => {
    const ai = read('src/components/AIRecognition.tsx');

    expect(ai).toContain('id="ai-capture"');
    expect(ai).toContain('data-mobile-table');
    expect(ai).toContain('data-label=');
  });

  it('keeps knowledge and news content readable at narrow phone widths', () => {
    expect(read('src/components/KnowledgeBase.tsx'))
      .toContain('grid-cols-1 min-[380px]:grid-cols-2');
    expect(read('src/components/NewsModule.tsx'))
      .toContain('w-full sm:w-96 md:w-[420px]');
  });

  it('uses phone-safe secondary modules and floating tools', () => {
    expect(read('src/components/ServiceMarket.tsx')).toContain('p-3 sm:p-6');
    expect(read('src/components/Feedback.tsx')).toContain('p-3 sm:p-6');
    expect(read('src/components/SettingsModal.tsx')).toContain('h-[100dvh] md:h-auto');
    expect(read('src/components/FarmCalendar.tsx')).toContain('max-h-[100dvh]');
    expect(read('src/components/AIAssistant.tsx')).toContain('inset-x-0 bottom-0');
  });
});
