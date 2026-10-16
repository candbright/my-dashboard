/**
 * Runs the browser template verification (ticket 21; every template since 46).
 *
 * # Why this is a test file
 *
 * `ResumePrintView` is a `.tsx` module. Node cannot load JSX — `node --import` fails with
 * `ERR_UNKNOWN_FILE_EXTENSION` — so the component has to be rendered through a transform that
 * understands it. vitest already provides one, so the render happens here and the browser work
 * happens in `scripts/verify-template-browser.mjs`.
 *
 * # Why it is skipped by default
 *
 * It launches a real Chromium and prints a real PDF, which is far too slow for the unit suite and
 * fails outright on a machine with no browser. `npm run verify:template` sets the flag; a plain
 * `npm run test` skips it. That mirrors the project's other browser checks, which are gates you run
 * deliberately rather than on every save.
 *
 * # Why it loops over the registry (ticket 48)
 *
 * The gate used to render the ATS-safe template and nothing else, so the failure it exists to catch —
 * a renderer that wraps its entries in a container pagination cannot see through, turning the whole
 * resume into one unbreakable block — was covered for exactly one of the templates. Each registry
 * entry now gets its own case, and the first case asserts that the registry, `TEMPLATE_METADATA` and
 * the loop agree: a template that is registered but not verified fails the gate instead of being
 * quietly absent from it.
 *
 * The presentation is built with `presentationFor`, i.e. the same merge the app performs, and handed
 * to `ResumePrintView` as the stored record — so each template is measured with **its own tokens**
 * (verdant's sage and sans face, classic's serif and 20mm margin) rather than in the product default.
 * That is what makes the script's font-family check meaningful.
 *
 * See the script's header for what it can and cannot verify. In particular, **font subsetting is not
 * checked here** — ADR-0001 puts that in the render service (ticket 23), because the browser's own
 * print pipeline embeds whatever face it resolved rather than a subset the product chose. Neither is
 * every *option* combination: the gate covers each template once, with the photo off.
 */

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResumePrintView } from '@/components/ResumePrintView';
import { RESUME_TEMPLATES } from '@/components/resume-render';
import { PRESENTATION_TEMPLATES } from '@/lib/resume-presentation';
import { TEMPLATE_METADATA, presentationFor } from '@/lib/resume-template';
import { verifyTemplate } from '../../scripts/verify-template-browser.mjs';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';

/** The same candidate the script describes, with `entryCount` jobs. */
function buildParsed(entryCount: number): ParsedResumeWithMetadata {
  const companies = Array.from({ length: entryCount }, (_, index) => ({
    title: index === 0 ? '高级全栈工程师' : `全栈工程师 ${index + 1}`,
    subtitle: index === 0 ? '某某科技' : `某某科技 ${index + 1}`,
    date: index === 0 ? '2022年6月 - 至今' : '2018年3月 - 2022年5月',
    details: [
      '主导前端架构升级，首屏渲染时间下降 45%，并统一了团队组件库',
      '设计并实现接口聚合层，接口响应时间下降 40%，P99 稳定在 120ms 以内',
      '接入 PostgreSQL 分库分表，支撑日均两千万次查询与峰值每秒八千次写入',
    ],
  }));

  return {
    frontmatter: {
      name: '李静',
      title: '全栈开发工程师',
      email: 'lijing@example.com',
      phone: '+86 138-0000-0000',
      location: '上海市',
      website: 'https://lijing.dev',
      github: 'https://github.com/lijing',
    },
    rawContent: '',
    sections: [
      {
        title: '关于我',
        content: '6 年全栈开发经验，精通 React/Next.js 与 Go，关注可访问性与渲染性能。',
        items: [],
        kind: 'summary',
      },
      { title: '工作经历', content: '', kind: 'experience', items: companies },
      // Skills are chip-group lines in `content`. A comma-separated bullet still splits on load;
      // one chip per line is what new documents write.
      {
        title: '技能',
        content: '- TypeScript, React, Go',
        kind: 'skills',
        items: [],
      },
    ],
  } as unknown as ParsedResumeWithMetadata;
}

describe.skipIf(!process.env.VERIFY_TEMPLATE)('模板渲染（真实浏览器，工单 21 / 48）', () => {
  it('verifies every registered template: registry, metadata and the loop agree', () => {
    const registeredIds = RESUME_TEMPLATES.map((template) => template.id);
    const metadataIds = TEMPLATE_METADATA.map((template) => template.id);

    // A template the gallery can offer but nothing can draw is the ADR-0008 defect with the sign
    // flipped; a renderer nothing registers is dead code. Both are caught here, and the per-template
    // cases below are generated from `RESUME_TEMPLATES`, so they cannot silently skip one.
    expect(registeredIds).toEqual(metadataIds);
    expect(registeredIds).toEqual([...PRESENTATION_TEMPLATES]);
    expect(RESUME_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  for (const template of RESUME_TEMPLATES) {
    it(`verifies ${template.name}（${template.id}）`, async () => {
      // The stored record names the template and chooses nothing else — which is what a user who
      // picks a template and changes no style actually has — and `ResumePrintView` resolves the
      // template's tokens from it, exactly as the editor preview and the export do.
      const stored = { schemaVersion: 1, template: template.id } as const;

      const result = await verifyTemplate({
        template,
        presentation: presentationFor(template, stored),
        buildMarkup: (entryCount: number) =>
          renderToStaticMarkup(
            createElement(ResumePrintView, {
              resume: { title: '我的简历', presentation: stored } as unknown as ResumeRecord,
              parsed: buildParsed(entryCount),
            })
          ),
      });

      // The script prints each check as it goes; this surfaces the list in the failure message so a
      // gate run does not require scrolling back through stdout to find what broke.
      expect(result.failures).toEqual([]);
    }, 300_000);
  }
});
