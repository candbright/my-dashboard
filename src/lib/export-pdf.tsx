'use client';

/**
 * Export entry points for a resume.
 *
 * Two paths, deliberately named apart because they produce very different files:
 *
 *   exportResumePdf   → real text layer, ATS-readable. Phase 1 of ADR-0001 uses
 *                       the browser's own print pipeline; Phase 4 swaps the
 *                       implementation for the render service of ADR-0007.
 *   exportResumeImage → PNG. No text layer, and labelled as an image in the UI.
 *                       Useful for pasting into chat apps, useless for an ATS.
 *
 * The contract both satisfy is ADR-0007's
 * `RenderResume(结构化内容, 展示态) → (文件字节, 渲染告警[])`.
 */

import { createRoot } from 'react-dom/client';
import { ResumePrintView } from '@/components/ResumePrintView';
import {
  a4ContentBox,
  buildPrintDocument,
  paginateBlocks,
  serializePrintRoot,
  type MeasuredBlock,
  type PrintPage,
} from '@/lib/print-resume';
import type { ResumeRecord } from '@/lib/types';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';

/** How long to wait for the off-screen render and its avatar image to settle. */
const RENDER_SETTLE_MS = 800;

/** Uniform page margin, mirrored by the `@page` rule in `PRINT_RESUME_CSS`. */
const PAGE_MARGIN_MM = 18;

/**
 * Walks the print root and produces one measured block per top-level element.
 *
 * Split from `paginatePrintRoot` so the traversal — which element is the repeated
 * header, which is a heading, which title a block carries — can be tested without a
 * layout engine. `measure` is injected for the same reason: real heights only exist
 * once a browser has laid the document out.
 *
 * The first child is the name/contact block and is returned separately, because it
 * is emitted as the header on every sheet rather than flowing with the content.
 */
export function collectPrintBlocks(
  printRoot: HTMLElement,
  measure: (element: HTMLElement) => number
): { headerHtml: string; blocks: MeasuredBlock[] } {
  const blocks: MeasuredBlock[] = [];
  let headerHtml = '';

  for (const child of Array.from(printRoot.children)) {
    const element = child as HTMLElement;

    if (headerHtml === '' && blocks.length === 0 && isHeaderBlock(element)) {
      headerHtml = element.outerHTML;
      continue;
    }

    blocks.push(measureBlock(element, measure));
  }

  return { headerHtml, blocks };
}

function measureBlock(
  element: HTMLElement,
  measure: (element: HTMLElement) => number
): MeasuredBlock {
  return {
    html: element.outerHTML,
    height: measure(element),
    isHeading: isHeadingBlock(element),
    title: sectionTitleOf(element),
  };
}

/**
 * Flattens the print view into a single breakable sequence.
 *
 * The unit of pagination is an **entry**, not a section. Treating a whole section as
 * one indivisible block is wrong whenever a section is taller than a page — a normal
 * work-history section with three jobs is — because `break-inside: avoid` cannot be
 * honoured and the section then has to occupy a page on its own, leaving the
 * preceding page nearly empty. Entries are what must not split; sections are
 * expected to span pages.
 *
 * # Transparent wrappers
 *
 * The walk cannot simply take each child of the print root, which is what it used to
 * do. A template arranges its sections in a stack and its entries in another stack,
 * and those wrappers exist to carry flex `gap` — a layout concern, not a pagination
 * one. Treating a wrapper as a block would make the *entire resume* one unbreakable
 * unit, because the section stack is a single child of the print root. That is a
 * silent failure rather than a visible one: the layout looks right, and the page
 * count is wrong.
 *
 * So an element that declares `data-print-flatten` is descended into instead of
 * measured, and sections are descended into as well because they declare
 * `data-print-section`. Both markers mean the same thing to this walk — "my children
 * are the real units" — and a template that omits them gets the old behaviour of one
 * block per element, which is still correct for a genuinely atomic block.
 *
 * # Why the section heading is hoisted
 *
 * The heading is emitted as its own block and `paginateBlocks` glues it to whatever
 * follows, so it can never be stranded at the bottom of a page. Its measured height
 * is not a duplicate: the heading is a child of its section, so it is counted exactly
 * once, here, and never again.
 *
 * Root order is preserved: the divider that follows the header stays before the
 * sections, not after them.
 */
export function flattenPrintFlow(
  printRoot: HTMLElement,
  measure: (element: HTMLElement) => number
): MeasuredBlock[] {
  const flow: MeasuredBlock[] = [];

  const emit = (element: HTMLElement): void => {
    // The header is lifted out by `collectPrintBlocks`; it is never part of the flow.
    if (isHeaderBlock(element)) return;

    if (element.dataset.printSection !== undefined) {
      // The heading travels with the section, glued to its first entry by the packing rules.
      const heading = element.querySelector('[data-print-role="heading"]');
      if (heading) flow.push(measureBlock(heading as HTMLElement, measure));

      for (const child of Array.from(element.children)) {
        // The heading is already in the flow.
        if (child === heading) continue;
        emit(child as HTMLElement);
      }
      return;
    }

    // A layout wrapper: descend, because its own height is the sum of its children's.
    if (element.dataset.printFlatten !== undefined) {
      for (const child of Array.from(element.children)) {
        emit(child as HTMLElement);
      }
      return;
    }

    flow.push(measureBlock(element, measure));
  };

  for (const child of Array.from(printRoot.children)) {
    emit(child as HTMLElement);
  }

  return flow;
}

/**
 * Measures the print view and groups it into physical pages.
 *
 * The name/contact block is emitted as the header on **every** sheet, including the
 * first. This was wrong in an earlier revision, which put it only on continuations
 * on the theory that page 1 "already starts with it" — but the header block is
 * removed from the flow when it is lifted out, so page 1 ended up with no name and
 * no contact details at all. Repeating it everywhere is also the better product
 * behaviour: a reader of page 3 should not have to look back to know whose resume
 * it is.
 */
export function paginatePrintRoot(printRoot: HTMLElement): PrintPage[] {
  const box = a4ContentBox(PAGE_MARGIN_MM);
  const { headerHtml } = collectPrintBlocks(printRoot, measureBlockHeight);
  const flow = flattenPrintFlow(printRoot, measureBlockHeight);

  return paginateBlocks(flow, box.height, box.width).map((page) => ({ ...page, headerHtml }));
}

/** Whether a block is the name/contact header rather than resume content. */
function isHeaderBlock(element: HTMLElement): boolean {
  return element.dataset.printRole === 'header';
}

/** Whether a block is a section heading that must stay with what follows. */
function isHeadingBlock(element: HTMLElement): boolean {
  return (
    element.dataset.printRole === 'heading' ||
    element.classList.contains('resume-section-heading')
  );
}

function sectionTitleOf(element: HTMLElement): string | undefined {
  if (!isHeadingBlock(element)) return undefined;
  return element.textContent?.trim() || undefined;
}

/**
 * Rendered height of a block, including its vertical margins.
 *
 * `getBoundingClientRect` excludes margins, and the sections in the print view are
 * separated by margins — ignoring them would overfill every page and push content
 * onto an extra sheet.
 */
function measureBlockHeight(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  const marginTop = Number.parseFloat(styles.marginTop) || 0;
  const marginBottom = Number.parseFloat(styles.marginBottom) || 0;

  // `offsetHeight` is a fallback for environments where the rect is zero (for
  // example a display:none subtree), so a measurement never silently reads as 0.
  const renderedHeight = rect.height || element.offsetHeight || 0;
  return renderedHeight + marginTop + marginBottom;
}

/**
 * Renders the resume off-screen and returns the print document for it.
 *
 * Separate from `openPrintDialog` so the document can be built in a test without
 * a print dialog existing. Throws if the print view did not render.
 */
export async function prepareResumePrintDocument(
  resume: ResumeRecord,
  parsed: ParsedResumeWithMetadata
): Promise<string> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.style.background = '#ffffff';
  document.body.appendChild(container);

  const root = createRoot(container);

  try {
    await new Promise<void>((resolve) => {
      root.render(<ResumePrintView resume={resume} parsed={parsed} />);
      // Give layout and the avatar image a chance to settle before serialising.
      setTimeout(resolve, RENDER_SETTLE_MS);
    });

    const printRoot = container.querySelector('#resume-print-root') as HTMLElement | null;
    if (!printRoot) {
      throw new Error('打印视图渲染失败，请重试。');
    }

    // Paginate rather than letting the browser break the flow: a header repeated
    // on every sheet requires real markup on every sheet (see `paginatePrintRoot`).
    const pages = paginatePrintRoot(printRoot);

    return buildPrintDocument({
      ...serializePrintRoot(printRoot),
      pages,
    });
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

/**
 * Opens the browser's print dialog for a prepared document.
 *
 * Uses a hidden iframe rather than `window.print()` on the live page: the live
 * page contains the navigation bar, editor chrome and toasts, and printing it
 * wholesale would put all of that on the user's resume.
 *
 * The document is supplied via `srcdoc`, which keeps it same-origin with the app
 * (so `contentWindow.print()` is callable) and avoids a popup blocker, which
 * `window.open` would not.
 */
export function openPrintDialog(html: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');

    // `display: none` makes some engines skip printing entirely, so hide it in a
    // way that keeps it laid out.
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.opacity = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', '简历打印');
    iframe.srcdoc = html;

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      iframe.remove();
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      iframe.remove();
      reject(new Error(message));
    };

    iframe.addEventListener('error', () => fail('无法打开打印视图，请重试。'));

    iframe.addEventListener('load', () => {
      const win = iframe.contentWindow;
      if (!win) {
        fail('无法打开打印视图，请重试。');
        return;
      }

      // `afterprint` fires when the dialog closes, whichever button was used.
      // `onafterprint` is the only reliable cross-browser signal; without it the
      // hook would stay in its loading state forever.
      win.addEventListener('afterprint', cleanup, { once: true });

      // Some browsers do not fire afterprint for a print() that the user
      // cancels, so also release after a generous grace period.
      const graceTimer = setTimeout(cleanup, 60_000);
      win.addEventListener('afterprint', () => clearTimeout(graceTimer), { once: true });

      try {
        win.focus();
        win.print();
      } catch {
        fail('浏览器阻止了打印窗口，请允许弹出窗口后重试。');
      }
    });

    document.body.appendChild(iframe);
  });
}

/** End-to-end PDF export: render, build the document, open the print dialog. */
export async function exportResumePdf(
  resume: ResumeRecord,
  parsed: ParsedResumeWithMetadata
): Promise<void> {
  const html = await prepareResumePrintDocument(resume, parsed);
  await openPrintDialog(html);
}

/**
 * Bitmap export. Kept because a PNG is genuinely more convenient than a PDF in
 * chat apps — but it has no text layer, so it is never presented as "导出 PDF".
 *
 * Note this does NOT go through jsPDF. Wrapping a bitmap in a PDF produces a file
 * that looks like a PDF and parses like a blank page — precisely the defect
 * ticket 03 removes — so offering it again under another button would undo that.
 */
export async function exportResumeImage(
  resume: ResumeRecord,
  parsed: ParsedResumeWithMetadata
): Promise<void> {
  const { default: html2canvas } = await import('html2canvas-pro');

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  container.style.background = '#ffffff';
  document.body.appendChild(container);

  const root = createRoot(container);

  try {
    await new Promise<void>((resolve) => {
      root.render(<ResumePrintView resume={resume} parsed={parsed} />);
      setTimeout(resolve, RENDER_SETTLE_MS);
    });

    const printRoot = container.querySelector('#resume-print-root') as HTMLElement | null;
    if (!printRoot) {
      throw new Error('打印视图渲染失败，请重试。');
    }

    const canvas = await html2canvas(printRoot, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      throw new Error('图片生成失败，请重试。');
    }

    downloadBlob(blob, `${resumeFileName(resume)}.png`);
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

/** A safe, human-readable file name for an export. */
export function resumeFileName(resume: ResumeRecord): string {
  const base = (resume.name || resume.title || 'resume').trim() || 'resume';
  // Strip characters that are illegal in Windows file names.
  return `${base.replace(/[\\/:*?"<>|]/g, '-')}-简历`;
}

/**
 * Hands a blob to the browser as a download.
 *
 * Exported because the plain-text export (ticket 06) needs exactly this and a second
 * copy would be a second place for the revoke-timing bug to reappear.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the click has taken the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Where the produced document gets its bytes. Phase 4 replaces this. */
export const PRINT_EXPORT_HINT =
  '已打开打印窗口。请在「目标打印机」中选择「另存为 PDF」，再点击「保存」。';
