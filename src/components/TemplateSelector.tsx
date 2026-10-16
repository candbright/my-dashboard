'use client';

/**
 * The template gallery and colour row — step 1 of the creation wizard (ticket 48, ADR-0008).
 *
 * # What this component is now
 *
 * It used to be a **starter** gallery: twelve cards, each a sample *document* with a description and an
 * industry-ish category, and clicking one filled the editor with that prose. The card's "template" was
 * a decoration. That is the confusion ADR-0008 exists to remove, and the ticket names it directly:
 * 不同模板改变的应该是简历的 UI 风格，而不是实际内容.
 *
 * So the gallery now chooses **styling only**. Every card is one entry of `TEMPLATE_METADATA`, drawn by
 * that template's own renderer, and clicking one changes nothing about the resume's text. Content is
 * step 2's business (a file, an AI parse, the blank document, or a 案例参考 sample — 内容种子, never
 * called a 模板). Two of the three things the old file learned the hard way still hold and are kept
 * below: a card needs a preview to be judgeable, and a badge whose meaning is not on screen is a badge
 * nobody can check.
 *
 * # The list is the registry, in registry order
 *
 * `TEMPLATE_METADATA` is read directly — no local list, no count, no ids spelled out. Three consequences
 * the ticket asked for explicitly:
 *
 *   - **Appending a template appends a card.** Another workstream adds `verdant-banner`; it appears here
 *     without this file changing, and the assertions in `TemplateSelector.test.tsx` are deliberately
 *     written against the registry rather than against a number.
 *   - **The first entry is the default**, because ADR-0008 makes the ATS-safe template first *so that*
 *     it is what an undecided user gets. It is drawn as 「默认」 and is pre-selected by the builder.
 *   - **The facets are derived from the cards**, so a filter can never offer something nothing claims.
 *
 * # The colour row is a palette, not a colour picker
 *
 * `PRESENTATION_PALETTE` is a closed set the server validates against, so the wizard can only offer
 * values that will be accepted. The default swatch is a real colour: no template ships an accent token,
 * so picking it again paints the resume in that colour rather than being read as "unspecified".
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  PARSEABILITY_LABELS,
  TEMPLATE_FACETS,
  TEMPLATE_METADATA,
  findTemplate,
  type TemplateFacet,
} from '@/lib/resume-template';
import { PRESENTATION_PALETTE } from '@/lib/resume-presentation';
import { defaultCreationTemplate } from '@/lib/resume-creation';
import { DEFAULT_RESUME_TEMPLATE, RESUME_TEMPLATES } from '@/components/resume-render';
import {
  PARSEABILITY_CRITERIA,
  PARSEABILITY_SUMMARY,
} from '@/lib/resume-parseability';
import {
  RESUME_THUMBNAIL_HEIGHT,
  RESUME_THUMBNAIL_WIDTH,
  TemplateThumbnail,
} from '@/components/resume-render/TemplateThumbnail';
import { Button } from '@/components/ui';

export interface TemplateSelectorProps {
  /** The chosen 视觉模板 id — see `resume-creation.ts` for what may be chosen. */
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  /**
   * The colour the resume will render in, **after** the template's tokens have been resolved.
   *
   * The gallery's cards preview exactly this colour, so the row and the cards cannot disagree.
   */
  accent: string;
  onAccentChange: (hex: string) => void;
}

/** The tint used for a rating badge. Warm colours only — the design system forbids cold ones. */
const PARSEABILITY_STYLES: Record<string, string> = {
  high: 'text-success bg-success/10',
  medium: 'text-warning bg-warning/10',
  low: 'text-danger bg-danger/10',
};

export function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
  accent,
  onAccentChange,
}: TemplateSelectorProps) {
  const [activeFacet, setActiveFacet] = useState<TemplateFacet | 'all'>('all');

  /** The registry's first entry: ADR-0008's ATS-safe template, and what 「默认」 means. */
  const defaultTemplateId = defaultCreationTemplate().id;

  /**
   * Only the facets that actually discriminate.
   *
   * Conflating the two halves of this is how a gallery ends up offering filters that all show the same
   * cards:
   *
   *   1. **Derived, not hand-written.** The list comes from the templates' own `facets`, so a facet
   *      nothing claims is never offered.
   *   2. **Discriminating, not merely claimed.** A facet every card carries cannot narrow anything —
   *      clicking 「单栏」 when every template is single-column is a no-op that looks like a control.
   *      Those stay off the filter row rather than being explained in a sentence under it.
   */
  const filters = useMemo(() => {
    const claimed = new Map<TemplateFacet, number>();
    for (const template of TEMPLATE_METADATA) {
      for (const facet of template.facets) {
        claimed.set(facet, (claimed.get(facet) ?? 0) + 1);
      }
    }

    const total = TEMPLATE_METADATA.length;
    return TEMPLATE_FACETS.filter(
      (facet) => claimed.has(facet.key) && (claimed.get(facet.key) ?? 0) < total
    );
  }, []);

  const shown =
    activeFacet === 'all'
      ? TEMPLATE_METADATA
      : TEMPLATE_METADATA.filter((template) => template.facets.includes(activeFacet));

  return (
    <div>
      {/* Facet filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {/* A native <button> rather than the UI `Button`: this is a filter chip in a row of
            identically-styled siblings, and `Button`'s variants do not express a selected state.
            This pattern predates the refactor and is kept so the visual change stays reviewable. */}
        <button
          onClick={() => setActiveFacet('all')}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium transition-all duration-500',
            activeFacet === 'all'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'bg-default-100 text-default-600 hover:bg-default-200'
          )}
        >
          全部
        </button>
        {filters.map((facet) => (
          <button
            key={facet.key}
            onClick={() => setActiveFacet(facet.key)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-all duration-500',
              activeFacet === facet.key
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                : 'bg-default-100 text-default-600 hover:bg-default-200'
            )}
          >
            {facet.label}
          </button>
        ))}
      </div>

      {/* Colour row.
          All six swatches are offered for every template, including one whose own accent is already
          the colour the row starts on: the accent is a property of the resume, not of the template, and
          a template's colour is a starting point rather than a lock. */}
      <div className="mb-6 rounded-[2rem] border border-default-200 bg-content1 p-5">
        <h3 className="font-serif text-base mb-3">配色</h3>

        <div className="flex flex-wrap items-center gap-3">
          {PRESENTATION_PALETTE.map((entry) => {
            const isSelected = entry.hex === accent;

            return (
              <Button
                key={entry.hex}
                isIconOnly
                size="sm"
                radius="full"
                aria-pressed={isSelected}
                aria-label={`主色：${entry.label}`}
                title={entry.label}
                data-accent={entry.hex}
                data-selected={isSelected ? 'true' : 'false'}
                onClick={() => onAccentChange(entry.hex)}
                style={{ backgroundColor: entry.hex }}
                className={cn(
                  'border border-default-200',
                  isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-content1'
                )}
              >
                {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Template grid.
          `max-w` is derived from the preview's fixed width rather than left to `1fr`: the preview is a
          fixed-size element so its scale factor is a known number (see `TemplateThumbnail`), and a
          fluid column wider than it would leave every card with a ragged strip of empty space. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
        <AnimatePresence mode="popLayout">
          {shown.map((template) => {
            const isSelected = selectedTemplateId === template.id;

            return (
              <motion.button
                key={template.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelectTemplate(template.id)}
                aria-pressed={isSelected}
                data-template-id={template.id}
                data-selected={isSelected ? 'true' : 'false'}
                className={cn(
                  'relative text-left rounded-[2rem] border p-4 transition-all duration-500',
                  isSelected
                    ? 'border-primary ring-2 ring-primary/30 bg-content1'
                    : 'border-default-200 bg-content1 hover:border-default-300'
                )}
              >
                {/* Selected indicator, in the colour the resume will actually use. */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ backgroundColor: accent }}
                    className="absolute top-3 right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center"
                  >
                    <Check className="w-3.5 h-3.5 text-primary-foreground" />
                  </motion.div>
                )}

                {/* The preview. Drawn by the template's own renderer, so it cannot go stale — see
                    `TemplateThumbnail` for why a shipped image was rejected. The renderer is resolved
                    by id because the metadata is what this gallery iterates: the registry pairs the two
                    and `RENDERERS` is exhaustive over the ids by type, so the fallback is unreachable
                    and exists only to keep the lookup total. */}
                <div className="rounded-[2rem] overflow-hidden border border-default-200 mb-3">
                  <TemplateThumbnail
                    template={findTemplate(template.id, RESUME_TEMPLATES) ?? DEFAULT_RESUME_TEMPLATE}
                    accent={accent}
                    width={RESUME_THUMBNAIL_WIDTH}
                    height={RESUME_THUMBNAIL_HEIGHT}
                    className="w-full"
                  />
                </div>

                {/* Title, and the badge that says which card an undecided user gets. */}
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-default-400" />
                  <h3 className="font-semibold text-sm">{template.name}</h3>
                  {template.id === defaultTemplateId && (
                    <span className="text-[10px] font-medium text-primary-foreground bg-primary px-2 py-0.5 rounded-full">
                      默认
                    </span>
                  )}
                </div>
                <p className="text-xs text-default-500 leading-relaxed mb-2">{template.description}</p>

                {/* Rating and facets. The rating is here from ticket 20 because ADR-0008 requires it to
                    be visible wherever a template is chosen — a user who cannot see it is choosing on
                    looks alone, which is the failure the requirement exists to stop. */}
                <div className="flex flex-wrap items-center gap-1">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md',
                      PARSEABILITY_STYLES[template.parseability] ?? PARSEABILITY_STYLES.medium
                    )}
                  >
                    解析友好度 {PARSEABILITY_LABELS[template.parseability]}
                  </span>
                  {template.facets.slice(0, 3).map((facet) => (
                    <span
                      key={facet}
                      className="text-[10px] font-medium text-default-400 bg-default-100 px-2 py-0.5 rounded-md"
                    >
                      {TEMPLATE_FACETS.find((f) => f.key === facet)?.label ?? facet}
                    </span>
                  ))}
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* The rating standard, visible.
          ADR-0008 requires the label to be justified against a written table; a badge whose meaning
          lives only in the source is exactly the "随口贴标签" outcome the table exists to prevent.
          A plain <details> rather than a tooltip: the badge is inside a card-shaped <button>, so a
          tooltip would either nest interactive content or need a portal, and this needs no JS.
          Below the grid rather than above it: it is read once, and it was pushing the cards — the thing
          the step is for — below the fold. */}
      <details className="group mt-6 rounded-[2rem] border border-default-200 bg-content2/60 px-5 py-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-default-700 marker:content-none [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="w-4 h-4 text-secondary" />
          <span className="flex-1">解析友好度是怎么判定的？</span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-default-400 transition-transform duration-500 ease-in-out group-open:rotate-180"
          />
        </summary>
        <div className="mt-4 space-y-3">
          {PARSEABILITY_CRITERIA.map((row) => (
            <div key={row.rating} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
              <span
                className={cn(
                  'shrink-0 inline-flex w-fit items-center text-[10px] font-medium px-2 py-0.5 rounded-md',
                  PARSEABILITY_STYLES[row.rating] ?? PARSEABILITY_STYLES.medium
                )}
              >
                {PARSEABILITY_LABELS[row.rating]}
              </span>
              <span className="text-xs text-default-500 leading-relaxed">
                {row.traits.join(' · ')}
                <span className="text-default-400"> — {PARSEABILITY_SUMMARY[row.rating]}</span>
              </span>
            </div>
          ))}
          <p className="text-xs text-default-400 leading-relaxed pt-1">
            判定依据是渲染出来的文档，不是风格偏好：双栏会把两条无关的文字流交错，图标会让电话号码失去
            标签，版式表格会让单元格以文档从未表达过的顺序被读出。
          </p>
        </div>
      </details>
    </div>
  );
}
