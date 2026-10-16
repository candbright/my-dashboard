/**
 * Screen pagination for the editor preview (ticket 48, ADR-0008).
 *
 * # Why a second paginator had to exist, and how it avoids being a second opinion
 *
 * The editor's preview used to be `ResumeDisplay` — the parsed-document view — which is a single
 * tall column with no sheets at all. Now that the preview draws the **chosen template**, it has to
 * show A4 sheets, because a template's styling is only meaningful at the width and height of paper.
 *
 * `paginateBlocks` (`print-resume.ts`) already decides page breaks, but it answers with **HTML
 * strings** per sheet, which only a `dangerouslySetInnerHTML` injection could render. That is used
 * nowhere in this repo and is not about to be: the preview must render the real React tree so the
 * template's own components, inline styles and accent keep working.
 *
 * So the split is by *what is measured*, not by re-deciding anything:
 *
 *   - {@link screenSheets} applies **the same three packing rules as `paginateBlocks`** — heading
 *     glued to its successor, a group that does not fit starts a new sheet, an oversized group is
 *     placed alone and flagged — but to measured **offsets** instead of markup, answering with a
 *     window per sheet.
 *   - Each sheet then renders the template once, translated by `-offset` and clipped to
 *     `contentHeight`, which is the offset-window technique. Because the whole flow is rendered and
 *     only *hidden*, there is no reflow: the line breaks on screen are the line breaks that were
 *     measured.
 *
 * The two packers cannot silently disagree: `resume-screen-pages.test.ts` feeds the *same* block
 * list to both and asserts they produce the same partition, sheet for sheet. If `paginateBlocks`
 * changes a rule, that test fails rather than the preview quietly paginating differently from the
 * PDF.
 *
 * # What the preview deliberately does not reproduce
 *
 * The print path lifts the name/contact header out of the flow and repeats it on **every** sheet
 * (`paginatePrintRoot`). The preview keeps the header in the flow, so it appears once, at the top of
 * sheet 1 — which is what a paginated document looks like, and the only arrangement the
 * offset-window technique can produce without rendering the template twice per sheet and inventing a
 * second layout arithmetic. The preview is the 近似预览 of ADR-0007's 「渲染档位」, not the delivered
 * file; the difference is recorded in ticket 48 rather than hidden.
 *
 * # Why the walk is duplicated here
 *
 * {@link measureScreenBlocks} repeats the traversal of `flattenPrintFlow` (`export-pdf.tsx`) for one
 * reason: that function returns measured *heights* with no reference to the elements they came from,
 * and this module needs each block's **offset in the flow**. A parallel array of elements would be a
 * second, silent coupling. The duplication is held honest the same way `verify-template-browser.mjs`
 * holds its own copy honest — a test renders the **real** template and asserts both walks see the
 * same number of units, one of which is the header the other one lifts out.
 */

/**
 * One pagination unit, positioned in the measured flow.
 *
 * The unit is the **entry** (`data-print-section` splits into a heading plus its entries; a container
 * marked `data-print-flatten` is descended into), and `height` includes the block's vertical margins
 * for the same reason `paginateBlocks` counts them: entry spacing is a CSS margin, and a margin is
 * not part of any container's height, so ignoring it packs pages with content that does not fit.
 */
export interface ScreenBlock {
  /** Distance from the top of the flow to this block's border box, in CSS pixels. */
  top: number;
  /** Rendered height including vertical margins, in CSS pixels. */
  height: number;
  /** Set when this block is a section heading, so it is kept with the block after it. */
  isHeading?: boolean;
}

/**
 * One A4 sheet of the preview, as a window onto the measured flow.
 *
 * `offset` and `height` are flow coordinates, not sheet-relative ones: the sheet renders the flow at
 * `translateY(-offset)` and clips at `height`. `height` is bounded both by the sheet and by where the
 * **next** sheet begins, because margins collapse — the distance between two consecutive block tops
 * can be smaller than the sum of the heights the packer added up. Without that second bound, a sheet
 * would show a few pixels of the block that belongs to the next one, which reads as a smeared, cut
 * line at the page foot.
 *
 * The **last** sheet has no next sheet to avoid, so it takes the whole content box. Bounding it to the
 * flow's end instead would collapse it to nothing wherever the flow cannot be measured — every offset
 * 0 — and the preview would render blank paper instead of an approximate document.
 */
export interface ScreenSheet {
  /** Flow coordinate the sheet's window starts at. */
  offset: number;
  /** Visible height of the window, never more than one sheet's content height. */
  height: number;
  /** Index into the block list of the first block assigned to this sheet, or `-1` when empty. */
  firstBlock: number;
  /** Index of the last block assigned to this sheet, inclusive, or `-1` when empty. */
  lastBlock: number;
  /** True when one group was taller than a whole sheet and had to be clipped (see `paginateBlocks`). */
  hasOversizedBlock?: boolean;
}

/** A group of blocks that must stay together: a heading plus what follows it. */
interface BlockGroup {
  /** Index of each block in the group, in flow order. */
  indices: number[];
  /** Sum of the group's measured heights. */
  height: number;
}

/**
 * Groups a flat measurement into sheets, by flow offset.
 *
 * Pure arithmetic, and deliberately the same three rules as `paginateBlocks`, in the same order:
 *
 *   1. a heading is glued to the block after it;
 *   2. a group that does not fit in what is left starts a new sheet;
 *   3. a group taller than an entire sheet is placed alone and flagged.
 *
 * An empty block list still yields one sheet: the preview has to show paper, not nothing.
 */
export function screenSheets(
  blocks: readonly ScreenBlock[],
  contentHeight: number
): ScreenSheet[] {
  const groups = groupBlocks(blocks);

  const sheetsOfGroups: BlockGroup[][] = [];
  let current: BlockGroup[] = [];
  let used = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    sheetsOfGroups.push(current);
    current = [];
    used = 0;
  };

  for (const group of groups) {
    // Rule 3: it can never fit, so honouring the break is impossible.
    if (group.height > contentHeight) {
      flush();
      sheetsOfGroups.push([group]);
      continue;
    }

    // Rule 2: it does not fit in what is left of this sheet.
    if (used + group.height > contentHeight) {
      flush();
    }

    current.push(group);
    used += group.height;
  }

  flush();

  if (sheetsOfGroups.length === 0) {
    return [{ offset: 0, height: contentHeight, firstBlock: -1, lastBlock: -1 }];
  }

  // The window the sheet clips at.
  //
  // `paginateBlocks` counts heights, so a group "fits" when the heights sum to less than a sheet —
  // but entry spacing is a collapsed CSS margin, which means two blocks can be visually closer than
  // the heights the packer added up. A sheet that clipped at `contentHeight` alone would therefore
  // draw the first few pixels of the block that the packer placed on the *next* sheet. The next
  // sheet's own offset is the tighter bound, and it is exact: everything above it belongs to this
  // sheet by construction.
  return sheetsOfGroups.map((sheetGroups, index) => {
    const first = sheetGroups[0];
    const last = sheetGroups[sheetGroups.length - 1];
    const firstBlock = first.indices[0];
    const offset = blocks[firstBlock]?.top ?? 0;
    const next = sheetsOfGroups[index + 1];
    const nextOffset = next ? blocks[next[0].indices[0]]?.top : undefined;

    return {
      offset,
      height:
        nextOffset === undefined
          ? contentHeight
          : Math.max(0, Math.min(contentHeight, nextOffset - offset)),
      firstBlock,
      lastBlock: last.indices[last.indices.length - 1],
      ...(sheetGroups.length === 1 && sheetGroups[0].height > contentHeight
        ? { hasOversizedBlock: true }
        : {}),
    };
  });
}

/** Rule 1, shared by the packer and the parity test's expectations. */
function groupBlocks(blocks: readonly ScreenBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const following = blocks[i + 1];

    if (block.isHeading && following !== undefined) {
      groups.push({ indices: [i, i + 1], height: block.height + following.height });
      i += 1;
      continue;
    }

    groups.push({ indices: [i], height: block.height });
  }

  return groups;
}

/**
 * Walks the print root and measures one block per pagination unit, with its flow offset.
 *
 * Mirrors `flattenPrintFlow` step for step, with one difference that is the point of this walk: the
 * **header is kept** as an ordinary block, because the preview renders the flow as one contiguous
 * window and the name and contact details have to be in it (see the module note).
 *
 * `measure` is injected so the traversal can be tested without a layout engine — the rules it
 * encodes are about markup, not about pixels.
 */
export function measureScreenBlocks(
  printRoot: HTMLElement,
  measure: (element: HTMLElement) => { top: number; height: number }
): ScreenBlock[] {
  const blocks: ScreenBlock[] = [];

  const emit = (element: HTMLElement): void => {
    if (element.dataset.printSection !== undefined) {
      // The heading travels with the section: it is the first thing on the sheet its first entry
      // lands on, and the packing rules glue the two together.
      const heading = element.querySelector('[data-print-role="heading"]');
      if (heading) blocks.push(blockOf(heading as HTMLElement, measure));

      for (const child of Array.from(element.children)) {
        // The heading is already in the list; pushing it again would measure it twice.
        if (child === heading) continue;
        emit(child as HTMLElement);
      }
      return;
    }

    // A layout wrapper — a section stack or an entry list. Its height is the sum of its children's,
    // so measuring it as one block would make the whole resume unbreakable (ticket 20).
    if (element.dataset.printFlatten !== undefined) {
      for (const child of Array.from(element.children)) {
        emit(child as HTMLElement);
      }
      return;
    }

    blocks.push(blockOf(element, measure));
  };

  for (const child of Array.from(printRoot.children)) {
    emit(child as HTMLElement);
  }

  return blocks;
}

/** One measured block, heading detection included so both call sites agree. */
function blockOf(
  element: HTMLElement,
  measure: (element: HTMLElement) => { top: number; height: number }
): ScreenBlock {
  const measured = measure(element);

  if (isHeadingBlock(element)) {
    return { ...measured, isHeading: true };
  }

  return measured;
}

/**
 * Whether a block is a section heading that must stay with what follows.
 *
 * The class is checked as well as the attribute because the class is what `PRINT_RESUME_CSS`
 * targets, and a renderer that emits one but not the other is still a heading to the stylesheet.
 * The same test lives in `export-pdf.tsx`; the parity test is what keeps the two in step.
 */
function isHeadingBlock(element: HTMLElement): boolean {
  return (
    element.dataset.printRole === 'heading' ||
    element.classList.contains('resume-section-heading')
  );
}
