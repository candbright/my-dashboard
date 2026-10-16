'use client';

/**
 * A visual preview of a template, drawn by the template itself (ticket 22, ADR-0008).
 *
 * # Why it renders instead of shipping a picture
 *
 * The gallery previously had no preview at all, and the obvious fix — a set of PNGs — has a failure
 * mode this project has already been bitten by twice: the picture and the renderer drift, and nothing
 * notices, because a picture cannot be out of date in a way a test can see. A gallery showing the
 * *old* design is worse than one showing none, because it is confidently wrong.
 *
 * So the preview is the real renderer, at real A4 width, scaled down. Nothing to redraw when a
 * template changes, and `resume-thumbnail.test.ts` can assert that two templates produce visibly
 * different markup.
 *
 * # What it shows and what it deliberately does not
 *
 * The **top** of the first page, clipped — a 3:4 window onto a 1:1.414 sheet. That is enough to show
 * the header treatment, the section-heading style and the accent, which is what distinguishes the
 * templates that exist. A thumbnail that fitted the whole page would show nothing legible at this
 * size, and the ticket says a preview need not be exact but must make the single-column/two-column
 * difference visible.
 *
 * # The layout is fixed, the look is not
 *
 * **Every card is drawn from one sample document.** Using the starter's own content would make each
 * card preview its *content*, which the user is about to replace — the gallery would then be
 * advertising 「金融分析师」's prose as if it were the design. What actually varies between cards is
 * the accent and the template, and those are what this varies.
 *
 * The accent is passed through `presentation`, not baked in, so what the card shows is the colour the
 * resume will really start with. Templates that set an `accentColor` token of their own
 * (`verdant-banner` sets the sage it is named for) are the exception — and they are shown the way
 * `resolveTemplate` really resolves them: the token wins where the passed accent is still the product
 * default, and the passed accent wins where it differs. Previewing anything else would be showing the
 * user a colour they are not going to get.
 *
 * # Why `transform` and a fixed pixel width
 *
 * `ResumePage` draws a real 794px A4 column in screen mode. Scaling it with `transform` keeps that
 * geometry exact and lets CSS do the arithmetic; re-rendering at a smaller font size would change
 * line breaking and the preview would stop being a preview of anything.
 *
 * `scale` is deliberately **not** supported: the wrapper's size is derived from it, and a support
 * style — older Safari ignores `zoom` — would silently produce a full-size resume inside a card.
 */

import { useMemo, type CSSProperties } from 'react';
import { parseResumeMarkdown, withMetadata } from '@/lib/resume-parser';
import { DEFAULT_PRESENTATION, type ResumePresentation } from '@/lib/resume-presentation';
import { resolveTemplate, type ResumeTemplate } from '@/lib/resume-template';

/**
 * The document every card shows.
 *
 * Written here rather than pulled from `RESUME_SEEDS` so the gallery's appearance cannot change
 * because someone edited a seed's prose. It is also deliberately unlike any starter's content: a
 * neutral sample cannot be mistaken for the sample the user is choosing.
 */
const SAMPLE_MARKDOWN = `## 关于我

一句话说明你的优势与求职方向，控制在两行以内。

## 工作经历

### 职位名称 | 公司名称

*2022年6月 - 至今*

- 用数字说明你负责的事与结果

## 教育背景

### 本科 专业 | 学校名称

*2018年9月 - 2022年6月*

## 技能

- 技能一
- 技能二
- 技能三`;

/** The width a resume page is drawn at, in CSS pixels — A4 at 96dpi. */
const PAGE_WIDTH = 794;

/**
 * The default card preview size, in CSS pixels.
 *
 * A 4:3 window onto the top of the sheet. These are **not** responsive: the preview is a fixed-width
 * element so that the scale factor is a known number, and a preview that reflowed with the grid would
 * change how much of the document it shows at every breakpoint. The gallery's grid is sized to match.
 */
export const RESUME_THUMBNAIL_WIDTH = 256;
export const RESUME_THUMBNAIL_HEIGHT = 192;

interface TemplateThumbnailProps {
  template: ResumeTemplate;
  /** The accent the resume will start with, as a palette hex. */
  accent: string;
  width?: number;
  height?: number;
  className?: string;
}

export function TemplateThumbnail({
  template,
  accent,
  width = RESUME_THUMBNAIL_WIDTH,
  height = RESUME_THUMBNAIL_HEIGHT,
  className,
}: TemplateThumbnailProps) {
  /**
   * Parsed once for the module's lifetime.
   *
   * Twelve cards each parse the same string on every render otherwise, and the parse is the only
   * real cost here. `useMemo` with no dependencies would be wrong under React's concurrent
   * rendering; a `useMemo([])` initialiser is the honest way to say "once".
   *
   * `withMetadata` normalises the frontmatter. `parseResumeMarkdown` types it as `unknown` on
   * purpose — a draft's YAML is not trusted — so the demo card has no metadata column to offer and
   * gets the sample's own frontmatter back, narrowed to the view renderers accept.
   */
  const content = useMemo(() => withMetadata(parseResumeMarkdown(SAMPLE_MARKDOWN), null), []);

  const presentation: ResumePresentation = useMemo(
    () => ({ ...DEFAULT_PRESENTATION, accentColor: accent, template: template.id }),
    [accent, template.id]
  );

  // `resolveTemplate` merges the template's own tokens over the presentation, so the preview shows
  // the template's serif/sans, line height and margin — not merely the card's accent.
  const resolved = resolveTemplate(template, presentation);

  const scale = width / PAGE_WIDTH;

  const outer: CSSProperties = {
    width,
    height,
    overflow: 'hidden',
    // White rather than the app's warm cream: a resume is printed on paper, and a tinted preview
    // would misrepresent the one thing this control is for. Matches `ResumePage`.
    background: '#ffffff',
    position: 'relative',
  };

  const inner: CSSProperties = {
    width: PAGE_WIDTH,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    // Without this the scaled page lays out at its unscaled height and the card grows to fit a
    // full A4 sheet. `absolute` takes it out of flow so the wrapper's fixed height is what shows.
    position: 'absolute',
    top: 0,
    left: 0,
  };

  const element = template.render({
    content,
    metadata: { frontmatter: content.frontmatter },
    presentation: resolved,
    mode: 'screen',
    fallbackTitle: '示例简历',
  });

  return (
    <div
      className={className}
      style={outer}
      // The preview is decorative: every fact in it is already stated in text next to the card, so
      // announcing it would make a screen reader read a fake resume before the real card title.
      aria-hidden="true"
      data-thumbnail-template={template.id}
      data-thumbnail-accent={resolved.accentColor}
    >
      <div style={inner}>{element}</div>
    </div>
  );
}
