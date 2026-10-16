import type { ResumeSection, SectionKind } from './resume-model';

/**
 * A section's category, for the renderers that need to know how to draw it.
 *
 * # This module is not authoritative
 *
 * The server classifies sections and sends the answer as `section.kind`
 * (`internal/biz/resumevault/structured.go`, ticket 18). **Read that first.** Everything here
 * exists only for the paths where no server snapshot is available — a draft in the builder,
 * or a conversation with a server that predates the field — and it is explicitly a *guess*
 * that happens to agree with the server, not a second opinion competing with it.
 *
 * The rules are duplicated deliberately rather than fetched, and the duplication is the
 * tradeoff ADR-0003 accepts: the editor cannot round-trip to the server on every keystroke.
 * What the duplication must not do is *diverge silently*, so:
 *
 *   - the evaluation order here matches `sectionKindRules` in the Go parser exactly;
 *   - `resume-section.test.ts` pins the pairs that order is about (`教育经历` is education,
 *     not experience) so a change on either side fails a test on this one.
 *
 * # What this replaced
 *
 * Two components each carried their own
 * `title.toLowerCase().includes('skill') || title.includes('技能') || …` test, and
 * `ResumeDisplay` carried the same list a third time inside `getSectionIcon`. The copies
 * already disagreed with the server: the server reads `教育经历` as education, the old icon
 * rules read it as experience, so the same section drew a briefcase on the resume page and a
 * graduation cap nowhere. One function is what makes that class of drift impossible.
 */

/** A rule pairs a kind with the title keywords that imply it, most specific first. */
interface SectionKindRule {
  kind: SectionKind;
  keywords: string[];
}

/**
 * Order matters — see the backend's `sectionKindRules`.
 *
 * `经历` ("experience") is inside `教育经历` and `项目经历`, so education and projects must
 * claim their own qualifier **before** the generic experience rule runs. Reordering these
 * silently reclassifies real sections, which is why a test pins them.
 */
const SECTION_KIND_RULES: readonly SectionKindRule[] = [
  { kind: 'summary', keywords: ['about', 'summary', '关于', '简介', '个人'] },
  { kind: 'education', keywords: ['education', '教育', '学历', '学位'] },
  { kind: 'projects', keywords: ['project', '项目', '作品'] },
  { kind: 'experience', keywords: ['experience', 'work', 'employment', '工作', '经历', '经验', '实习'] },
  { kind: 'skills', keywords: ['skill', 'tech', '技能', '技术', '专长'] },
];

/**
 * Classify a section by its title, mirroring the server's `ClassifySection`.
 *
 * Returns `'other'` for a title no rule recognises. That is a real answer, not a failure: a
 * section nobody recognises still renders as an ordinary section, and guessing a category
 * would draw it in a shape that does not fit it.
 *
 * Latin keywords are matched as **prefixes** (`tech` must match `Technical Skills`), which
 * is why this is a substring test rather than a word-boundary one.
 */
export function classifySectionTitle(title: string): SectionKind {
  const lower = title.toLowerCase();
  if (!lower.trim()) return 'other';

  for (const rule of SECTION_KIND_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) return rule.kind;
    }
  }
  return 'other';
}

/**
 * The section's kind: the server's answer when it gave one, otherwise a local classification.
 *
 * Renderers must call this rather than reading `section.kind` directly and falling back
 * themselves, because the fallback is a rule that has to agree with the server — keeping it
 * in one place is the entire point.
 */
export function resolveSectionKind(section: Pick<ResumeSection, 'title' | 'kind'>): SectionKind {
  return section.kind ?? classifySectionTitle(section.title);
}

/**
 * Does this section hold a list of skills?
 *
 * `true` for the server's `skills` kind, and for a locally-parsed title that classifies as
 * one. A renderer uses this to decide whether to draw chips rather than prose or items.
 */
export function isSkillsSection(section: Pick<ResumeSection, 'title' | 'kind'>): boolean {
  return resolveSectionKind(section) === 'skills';
}

/**
 * The separator characters a skill list may use, half-width and full-width.
 *
 * A superset of the old `','`-only split. `、` is what this app's own seed documents use, so
 * `Go、PostgreSQL、Kubernetes` used to render as **one** skill named "Go、PostgreSQL、
 * Kubernetes" — the exact failure the ticket names.
 *
 * Kept in sync with `skillSeparators` in `internal/biz/resumevault/structured.go`.
 */
const SKILL_SEPARATORS = /[ \t,，、;；/|]+/;

/**
 * Split a skill list into individual skills.
 *
 * Blank segments are dropped, so a trailing separator produces no empty chip. An empty or
 * separator-only input yields `[]`.
 *
 * Note the deliberate consequence of `/` being a separator: `CI/CD` becomes two skills. That
 * matches the server, and the ticket lists `/` explicitly; the alternative — special-casing
 * it — would make the two parsers disagree, which is the thing being fixed.
 */
export function splitSkillList(value: string): string[] {
  if (!value) return [];
  return value
    .split(SKILL_SEPARATORS)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/**
 * Every skill a section describes, deduplicated, in document order.
 *
 * Reads all three places a skill list is written, because a resume may use any of them and
 * the old `SkillsGrid` only understood some:
 *
 *  1. `content` — the common case, `## 技能` followed by one line of separators;
 *  2. `content` as bullets — `- Go` lines, whose markers are stripped;
 *  3. item titles and details — `### Go` or a bullet under an item.
 *
 * Deduplication is by exact string (the old behaviour), and order is first-seen so the
 * rendered chips follow the document rather than a sort.
 */
export function collectSkills(section: {
  content?: string;
  items?: ResumeSection['items'];
}): string[] {
  const found: string[] = [];

  for (const line of (section.content ?? '').split('\n')) {
    // Strip a bullet marker before splitting, so `- Go` yields `Go` and not `- Go`.
    const cleaned = line.replace(/^[-*]\s+/, '').trim();
    found.push(...splitSkillList(cleaned));
  }

  for (const item of section.items ?? []) {
    found.push(...splitSkillList(item.title));
    for (const detail of item.details ?? []) {
      found.push(...splitSkillList(detail));
    }
  }

  return [...new Set(found)];
}
