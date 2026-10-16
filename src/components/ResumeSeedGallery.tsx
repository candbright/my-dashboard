'use client';

/**
 * The 案例参考 gallery — the third way to fill in a resume's content (ticket 48).
 *
 * # These are 内容种子, not 模板
 *
 * ADR-0008 splits the two, and this gallery is the place the distinction is easiest to get wrong. A card
 * here offers a **document** — 金融分析师's prose, an entry-level lawyer's 实习经历 — with no styling
 * attached. Your chosen template renders it in step 3, exactly as it would render a file you uploaded.
 * `CONTEXT.md` is explicit about the vocabulary: calling one of these a 模板 is what made the old
 * gallery look like it chose a design when it only chose text.
 *
 * # So the cards carry no layout preview
 *
 * The template gallery's cards show thumbnails because a template is judged by looking at it. A content
 * card showing a *rendered* preview would be judged by looking at it too — and the user would be looking
 * at the layout they already picked in step 1, or worse, at the layout of whichever template happened to
 * draw the preview. A name and a one-line description are the honest summary of a document, which is why
 * `seedSummary` reads that line out of the document itself instead of a hand-written field.
 *
 * The card is a plain `<button>` for the same reason the template cards are: it is a multi-line
 * card-shaped choice, which is not what the `Button` atom expresses (see `TemplateSelector`).
 */

import { cn } from '@/lib/cn';
import {
  BLANK_SEED_ID,
  RESUME_SEEDS,
  seedSummary,
  type ResumeSeed,
} from '@/lib/resume-template-seeds';

export interface ResumeSeedGalleryProps {
  /**
   * Called when a case is highlighted. That is a choice, not a draft: the caller
   * commits it when 下一步 is pressed.
   */
  onPick: (seed: ResumeSeed) => void;
  /** The case currently chosen, so the card can show as selected. */
  selectedId?: string;
  className?: string;
}

export function ResumeSeedGallery({ onPick, selectedId, className }: ResumeSeedGalleryProps) {
  // The `blank` seed is 空白创建's document, not a case: it is placeholder scaffolding, and offering it
  // here as well would put two cards on one screen that do the same thing.
  const seeds = RESUME_SEEDS.filter((seed) => seed.id !== BLANK_SEED_ID);

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3', className)}>
      {seeds.map((seed) => {
        const summary = seedSummary(seed);

        return (
          <button
            key={seed.id}
            type="button"
            onClick={() => onPick(seed)}
            data-seed-id={seed.id}
            data-selected={selectedId === seed.id ? 'true' : undefined}
            className={cn(
              'text-left rounded-[2rem] border bg-content1 p-4',
              'transition-colors duration-500 ease-in-out hover:border-primary/40',
              selectedId === seed.id ? 'border-primary bg-content2' : 'border-default-200'
            )}
          >
            <span className="block text-sm font-medium mb-1">{seed.name}</span>
            {summary !== '' && (
              <span className="block text-xs text-default-500 leading-relaxed">{summary}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
