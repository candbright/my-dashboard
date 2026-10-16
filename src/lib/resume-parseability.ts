/**
 * What 「解析友好度 高/中/低」 means, written down (ADR-0008, ticket 22).
 *
 * # Why this is a module and not a tooltip string
 *
 * ADR-0008 requires every template to be labelled 高/中/低 **against a written table**, because the
 * alternative — deciding the label by feel — turns a claim about the product into a claim about the
 * reviewer's mood. The table lives here, away from the component that renders it, so that:
 *
 *   - the gallery can print the standard next to the badges, and
 *   - a test can assert that every criterion the *code* relies on is one of the rows, and
 *   - adding a fourth row is a deliberate edit to a named table rather than a new badge colour.
 *
 * # The criteria are observations about markup, not about quality
 *
 * Each row lists things a reader can check by looking at the rendered document. That is the point:
 * a label whose justification cannot be pointed at is a label the user has to take on faith, and
 * this badge exists precisely to not be taken on faith.
 *
 * The ordering is 高 → 低 and matches `PARSEABILITY_ORDER`, so the legend reads as a scale rather
 * than as a set.
 */

import type { TemplateParseability } from '@/lib/resume-template';

/** One row of the standard. */
export interface ParseabilityCriterion {
  /** The rating this row describes. */
  rating: TemplateParseability;
  /** What the rendered document looks like, as observable facts. */
  traits: readonly string[];
}

/**
 * The standard, most-friendly first.
 *
 * Wording is deliberately concrete — "单栏" and "无版式表格" rather than "结构清晰", which is exactly
 * the sort of adjective that lets a two-column layout with a table pass as 高.
 *
 * Each `traits` entry is a complete phrase, because the gallery joins them with a list separator and
 * a entry that began with 「或」 would render as 「…元素，或、双栏…」. The alternative reading of 中 —
 * that a document is rated by *how far* it departs rather than by which box it ticks — is carried by
 * `PARSEABILITY_SUMMARY` instead.
 */
export const PARSEABILITY_CRITERIA: readonly ParseabilityCriterion[] = [
  {
    rating: 'high',
    traits: ['单栏', '无装饰性图标', '联系方式在正文中', '无版式表格'],
  },
  {
    rating: 'medium',
    traits: ['单栏但含装饰元素', '双栏但内容分区清晰'],
  },
  {
    rating: 'low',
    traits: ['双栏', '图标', '证件照', '版式表格'],
  },
] as const;

/** The ratings in display order, derived so the two cannot disagree. */
export const PARSEABILITY_ORDER: readonly TemplateParseability[] = PARSEABILITY_CRITERIA.map(
  (row) => row.rating
);

/**
 * The one-line summary shown next to a badge.
 *
 * `medium` and `low` are worded as departures from `high` rather than as their own lists, because
 * that is how the table reads: a template is 中 or 低 by how far it moves away from the safe set,
 * not by acquiring some positive quality the safe set lacks.
 */
export const PARSEABILITY_SUMMARY: Record<TemplateParseability, string> = {
  high: '满足全部「高」判据，投递大公司首选',
  medium: '离「高」判据有距离，取决于投递渠道',
  low: '多处偏离判据，机器解析可能丢内容',
};
