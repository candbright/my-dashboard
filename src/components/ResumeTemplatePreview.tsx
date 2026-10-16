'use client';

/**
 * The template preview: the real renderer, paginated into A4 sheets (ticket 48).
 *
 * # What this replaces, and why that mattered
 *
 * The editor's 预览 tab used to render `ResumeDisplay` — the parsed-*document* view. It showed the
 * resume's text with no template on it at all, so a user who had just chosen 绿野通栏 in step 1 saw a
 * plain document and concluded the choice had not taken. The ticket's third acceptance criterion is
 * exactly this: 预览不是预览 html 解析内容了，而是预览带 ui 模板的简历.
 *
 * So this renders **the chosen template**, through the same component the print/PDF path uses
 * (`ResumePrintView`), at the width the print path lays out at. It is a 近似预览 — ADR-0007's
 * 「渲染档位」 — not the delivered file, and what it deliberately does not reproduce is listed in
 * `resume-screen-pages.ts`.
 *
 * # How it paginates without HTML injection
 *
 * `paginatePrintRoot` answers with HTML strings, which only `dangerouslySetInnerHTML` could render —
 * used nowhere in this repo. Instead:
 *
 *   1. The template is rendered **once per sheet** inside a window of `contentBox.width`.
 *   2. The first copy (sheet 1, untranslated) is measured: `measureScreenBlocks` walks it and reports
 *      each block's offset and height, using the same `data-print-section` / `data-print-flatten`
 *      markers the export path relies on.
 *   3. `screenSheets` turns those measurements into windows, applying the same packing rules as
 *      `paginateBlocks` (held identical by a parity test).
 *   4. Every sheet then renders the flow at `translateY(-offset)` and clips it, so the line breaks on
 *      screen are the line breaks that were measured — the flow is moved, never re-laid-out.
 *
 * # The geometry is the print path's geometry
 *
 * The content width comes from `a4ContentBox(pageMarginToMillimetres(presentation.pageMargin))` and the
 * template is rendered in `mode: 'print'` (`width: 100%`, no padding), inside a container of exactly
 * that width. `scripts/verify-template-browser.mjs` sets its measurement container up the same way and
 * says why: `#resume-print-root` is `width: 100%`, so a container of any other width changes where the
 * lines break, and a preview that wraps differently from the PDF is worse than no preview.
 *
 * # Accessibility
 *
 * `overflow: hidden` hides a sheet's overflow from the eye, not from a screen reader, and every sheet
 * carries a copy of the same document. The first sheet is therefore the accessible one and the rest are
 * `aria-hidden`: the resume is read once, in order, and the later sheets are acknowledged as visual
 * continuations. (They are also the reason the sheets are keyed by index *and* offset — a shift in
 * pagination must re-render rather than move an old copy.)
 *
 * # Why `useEffect` and not `useLayoutEffect`
 *
 * This is a client component that Next renders on the server too, and `useLayoutEffect` on the server is
 * a warning and a no-op. The cost of `useEffect` is one frame with the initial single-sheet state — and
 * that state is already correct for what it shows: sheet 1 clipped at the page height, which is what a
 * one-page resume looks like. The extra sheets appear on the next frame rather than the content
 * flickering.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ResumePrintView } from '@/components/ResumePrintView';
import { A4_HEIGHT_PX, A4_WIDTH_PX, a4ContentBox, mmToPx } from '@/lib/print-resume';
import { parseResumeMarkdown, resumeMetadataView } from '@/lib/resume-parser';
import { previewMetadataValues } from '@/lib/resume-preview-metadata';
import { pageMarginToMillimetres, type ResumePresentation } from '@/lib/resume-presentation';
import { measureScreenBlocks, screenSheets, type ScreenSheet } from '@/lib/resume-screen-pages';
import { cn } from '@/lib/cn';
import type { ResumeMetadataValues } from '@/lib/resume-metadata';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';

/** The margin used when a presentation's page margin cannot be read. Matches `DEFAULT_PRESENTATION`. */
const FALLBACK_PAGE_MARGIN_MM = 18;

export interface ResumeTemplatePreviewProps {
  /** The document body. Frontmatter in it is ignored — `metadataValues` is the authority. */
  markdown: string;
  /**
   * The draft's 简历元数据, as the form holds it. Blank fields are filled with the form's own
   * placeholders **for this preview only** — see `resume-preview-metadata.ts`, and note that the save
   * path must keep using the raw values.
   */
  metadataValues: ResumeMetadataValues;
  /** The complete 展示态 to render: the template, its resolved tokens and the user's choices. */
  presentation: ResumePresentation;
  className?: string;
}

export function ResumeTemplatePreview({
  markdown,
  metadataValues,
  presentation,
  className,
}: ResumeTemplatePreviewProps) {
  const marginMm =
    pageMarginToMillimetres(presentation.pageMargin) ?? FALLBACK_PAGE_MARGIN_MM;
  const contentBox = useMemo(() => a4ContentBox(marginMm), [marginMm]);
  const marginPx = mmToPx(marginMm);

  /**
   * The document the renderers read.
   *
   * `frontmatter` is the metadata view, not the parsed document's own frontmatter: the form is what the
   * user is typing into, and a seed or upload was copied into it when the editor opened. Going through
   * `resumeMetadataView` keeps the column→frontmatter key mapping (`job_title` → `title`) in one place,
   * so the preview cannot disagree with the saved document about the job title.
   */
  const parsed = useMemo(
    () =>
      ({
        ...parseResumeMarkdown(markdown),
        frontmatter: resumeMetadataView(previewMetadataValues(metadataValues)),
      }) as ParsedResumeWithMetadata,
    [markdown, metadataValues]
  );

  /** The record `ResumePrintView` reads its title from; there is no stored resume yet. */
  const resume = useMemo(
    () =>
      ({
        id: 'preview',
        title: (parsed.frontmatter?.name as string | undefined) || '我的简历',
        presentation: null,
      }) as unknown as ResumeRecord,
    [parsed]
  );

  /**
   * The pagination. Seeded with the empty-flow sheet rather than `[]`, so the first paint is a page
   * even before anything can be measured.
   */
  const [sheets, setSheets] = useState<ScreenSheet[]>(() => screenSheets([], contentBox.height));

  /** Sheet 1's flow, which is both displayed and measured — there is no separate hidden copy. */
  const flowRef = useRef<HTMLDivElement | null>(null);

  /** Bumped when the browser finishes loading a font, because font metrics decide where lines break. */
  const [fontsSettled, setFontsSettled] = useState(0);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.addEventListener) return;

    const onSettled = () => setFontsSettled((count) => count + 1);
    fonts.addEventListener('loadingdone', onSettled);
    return () => fonts.removeEventListener('loadingdone', onSettled);
  }, []);

  // A primitive key for the styling, so a new `presentation` object with the same contents does not
  // re-measure: the builder rebuilds it on every render, and the editor re-renders on every keystroke.
  const styleKey = JSON.stringify(presentation);

  useEffect(() => {
    const root = flowRef.current?.querySelector('#resume-print-root');
    if (!(root instanceof HTMLElement)) return;

    // Offsets are taken relative to the flow's own top, and heights add the vertical margins because
    // entry spacing is a collapsed CSS margin: `getBoundingClientRect` excludes it, and the packer has
    // to count it or every sheet is overfilled. Same measurement as `measureBlockHeight` in
    // `export-pdf.tsx`, plus the offset that walk does not report.
    const rootTop = root.getBoundingClientRect().top;
    const blocks = measureScreenBlocks(root, (element) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      const marginTop = Number.parseFloat(styles.marginTop) || 0;
      const marginBottom = Number.parseFloat(styles.marginBottom) || 0;

      return {
        top: rect.top - rootTop,
        // `offsetHeight` is the fallback for a subtree with no layout, so a height never reads as 0
        // when it is merely unmeasured.
        height: (rect.height || element.offsetHeight || 0) + marginTop + marginBottom,
      };
    });

    const measured = screenSheets(blocks, contentBox.height);
    setSheets((previous) =>
      JSON.stringify(previous) === JSON.stringify(measured) ? previous : measured
    );
  }, [markdown, metadataValues, styleKey, contentBox.height, fontsSettled]);

  const flow: ReactElement = (
    <ResumePrintView resume={resume} parsed={parsed} presentation={presentation} />
  );

  return (
    <div
      className={cn('flex flex-col items-center gap-6', className)}
      data-preview-template={presentation.template}
    >
      {sheets.map((sheet, index) => (
        <div
          key={`${index}-${sheet.offset}-${sheet.height}`}
          data-preview-page={index + 1}
          aria-hidden={index > 0 ? true : undefined}
          // Paper: white and square-cornered, exactly as `ResumePage` draws it on screen. The design
          // system's rounded cards are chrome; a resume sheet is a sheet of paper.
          className="relative shrink-0 overflow-hidden bg-white shadow-sm"
          style={{ width: A4_WIDTH_PX, height: A4_HEIGHT_PX }}
        >
          {/* The page margin, as a clip window. Everything outside it is the unprintable edge. */}
          <div
            className="absolute overflow-hidden"
            style={{
              left: marginPx,
              top: marginPx,
              width: contentBox.width,
              height: Math.max(0, Math.min(sheet.height, contentBox.height)),
            }}
          >
            <div
              ref={index === 0 ? flowRef : undefined}
              style={{ width: contentBox.width, transform: `translateY(-${sheet.offset}px)` }}
            >
              {flow}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
