/**
 * The template registry (ticket 20, ADR-0008).
 *
 * # What a template is here
 *
 * ADR-0008 defines a template as **a renderer plus style tokens**, and requires the content seed to
 * be separated out as an attribute rather than being the template. That separation is the whole
 * point of this module, because the previous design had it wrong in a way that caused real damage:
 *
 * `resume-templates.ts` used to define 12 "templates" that were 12 **documents**. A user picking
 * 「全栈工程师」 picked a sample resume; the visual result was identical no matter which card they
 * clicked, because there was only ever one renderer. The card promised a look and delivered a text
 * file. Ticket 22 fixes the gallery; this module fixes the model underneath it.
 *
 * So there are two concepts, and they are now named differently:
 *
 *   - **`ResumeTemplate`** — a way of drawing a resume. Has a renderer, style tokens, facets and a
 *     parseability rating. Ids must exist in `PRESENTATION_TEMPLATES`, which is a closed set shared
 *     with the server.
 *   - **`ResumeSeed`** (`resume-template-seeds.ts`) — a sample document, shown as 案例参考 and used
 *     by "start from this example". It carries no rendering opinion at all: the styling comes from
 *     whichever `ResumeTemplate` the user picked in the step before (ticket 48).
 *
 * # Why the ids are a closed set shared with the server
 *
 * `PresentationTemplate` is a union of literal ids and `PRESENTATION_TEMPLATES` is asserted against
 * a fixture generated from the Go constants (`resume-presentation-parity.test.ts`). Adding a
 * template is therefore **a backend change**, and the parity test fails until both sides agree.
 * That is deliberate — ADR-0004 rejected storing arbitrary strings in the `presentation` JSONB
 * column — but it is worth stating plainly, because it is the kind of constraint that looks like an
 * oversight when someone adds template number three and the build breaks.
 *
 * # A renderer must be a pure function
 *
 * No hooks, no context, no `useState`. The same code runs in three places:
 *
 *   1. the in-app preview (`ResumePageClient`),
 *   2. an off-screen React root that is measured and printed (`export-pdf.tsx`), and
 *   3. eventually, the phase 4 render service (ADR-0007), which is a Node process with no React
 *      renderer around it.
 *
 * A hook would work in the first and throw in the third. `TemplateRendererInput` carries everything
 * a renderer may look at, which is why the type has no optional members.
 */

import type { ReactElement } from 'react';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import {
  DEFAULT_PRESENTATION,
  presentationFromRecord,
  type PresentationFontFamily,
  type PresentationTemplate,
  type ResumePresentation,
} from '@/lib/resume-presentation';

export type { PresentationFontFamily, PresentationTemplate };

/**
 * The presentation fields a template is allowed to decide.
 *
 * A template may choose how a resume looks; it may not choose what is in it. `sectionOrder` and
 * `schemaVersion` are absent, and that is the point — reordering a candidate's sections is an
 * editorial act about their content, not a styling decision, and a template that could do it would
 * be able to lose a section off the end of the list.
 *
 * `Pick` rather than a hand-written list so this cannot drift from `ResumePresentation`: adding a
 * field there makes it visible here, and removing one breaks here at compile time.
 */
export type PresentableFields = Pick<
  ResumePresentation,
  'template' | 'accentColor' | 'fontFamily' | 'fontScale' | 'lineHeight' | 'pageMargin' | 'photo'
>;

/** The tokens a template overrides. Partial, because a template should only state what it cares about. */
export type PresentationTokens = Partial<PresentableFields>;

/**
 * How reliably an ATS parser will recover this template's content.
 *
 * ADR-0008 requires every template to carry a rating against a written table, and requires the
 * labels 高/中/低 to be shown to the user. The rating is a judgement, not a measurement, which is
 * exactly why it is typed as a three-value union with written criteria below rather than a number:
 * a fabricated percentage would look like evidence and be nothing of the kind. ADR-0005 already
 * established that this product does not invent scores.
 */
export type TemplateParseability = 'high' | 'medium' | 'low';

/**
 * The written table the ratings are assigned from (ADR-0008).
 *
 * Ordered from most to least parseable, and each entry states what costs the points, so a new
 * template can be rated by comparison instead of by taste:
 *
 *   - **high** — one column, no icons standing in for text, contacts in the body, no layout tables,
 *     no text in images, a standard font. A parser reading the text layer in order recovers
 *     everything.
 *   - **medium** — readable, but some information is carried by position or by a graphic: a sidebar
 *     whose text a linear reader takes out of order, an icon next to the phone number with the
 *     label omitted, a heading rendered as an image.
 *   - **low** — the document's meaning depends on seeing it: two-column flow a parser cannot
 *     interleave correctly, contact details inside a graphic, or text over a coloured panel where
 *     an image-based extractor may drop it.
 *
 * Displayed to users as 高/中/低 — see `PARSEABILITY_LABELS`.
 */
export const PARSEABILITY_LABELS: Record<TemplateParseability, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/**
 * What a template is *for* (ADR-0008).
 *
 * Deliberately **purpose** and not visual style. The old gallery filtered by industry (`tech`,
 * `legal`, `education`), which is a property of the sample content, not of the design — so every
 * filter led to the same renderer and the choice meant nothing.
 *
 * `single-column` / `two-column` are in the same list because column count is the one structural
 * choice a job seeker actually makes deliberately: a two-column resume looks denser and is
 * measurably worse for automated screening.
 */
export type TemplateFacet =
  | 'campus'
  | 'experienced'
  | 'internship'
  | 'overseas'
  | 'postgrad'
  | 'referral'
  | 'single-column'
  | 'two-column';

/** Facet labels, in the order a gallery should show them. */
export const TEMPLATE_FACETS: readonly { key: TemplateFacet; label: string }[] = [
  { key: 'campus', label: '校招' },
  { key: 'experienced', label: '社招' },
  { key: 'internship', label: '实习' },
  { key: 'overseas', label: '留学' },
  { key: 'postgrad', label: '考研复试' },
  { key: 'referral', label: '内推' },
  { key: 'single-column', label: '单栏' },
  { key: 'two-column', label: '双栏' },
] as const;

/** Whether a template is being drawn for paper or for the screen. */
export type RenderMode = 'print' | 'screen';

/**
 * The metadata a renderer may display.
 *
 * A structural subset of `ParsedResumeWithMetadata`, so a caller can pass a parsed resume directly.
 * It is narrowed to `frontmatter` on purpose: a renderer has no business reading `rawContent`, and
 * saying so in the type is cheaper than a convention.
 */
export interface TemplateMetadata {
  frontmatter: ParsedResumeWithMetadata['frontmatter'];
}

/** Everything a renderer is allowed to look at. */
export interface TemplateRendererInput {
  /** The resume's sections, in document order. */
  content: ParsedResumeWithMetadata;
  /** The candidate's metadata — name, contacts, photo. */
  metadata: TemplateMetadata;
  /** The resolved presentation: the template's tokens already merged with the user's choices. */
  presentation: ResumePresentation;
  mode: RenderMode;
  /**
   * The resume's `title` column, used only as a fallback display name.
   *
   * Here rather than inside `metadata` because it is not candidate metadata — it is the resume's
   * own name, which is what a resume saved before metadata existed has instead of a name.
   */
  fallbackTitle: string;
}

/** A renderer: a pure function from input to a React element. */
export type TemplateRenderer = (input: TemplateRendererInput) => ReactElement;

/** A way of drawing a resume. */
export interface ResumeTemplate {
  /** Must be a member of `PRESENTATION_TEMPLATES` — see the module note about the closed set. */
  id: PresentationTemplate;
  name: string;
  description: string;
  /** What this template is for. Drives the gallery filter (ticket 22). */
  facets: readonly TemplateFacet[];
  /** How well an ATS recovers the content, rated against `PARSEABILITY_LABELS`' table. */
  parseability: TemplateParseability;
  /** The styling this template imposes. The user's own choices still win. */
  tokens: PresentationTokens;
  render: TemplateRenderer;
}

/**
 * A template's identity and styling: everything a reader needs that is not the renderer.
 *
 * The renderer is deliberately the only thing left out. It is a React component, so a module that
 * carries one cannot be imported by the ones that only want to list or describe templates — which is
 * why the registry used to live under `components/` and the starter catalogue had to reach up into
 * it. The metadata is data; the pairing with a renderer happens in `components/resume-render`.
 */
export type ResumeTemplateMetadata = Omit<ResumeTemplate, 'render'>;

/**
 * Every registered template's metadata, **safest first**.
 *
 * # Order is load-bearing
 *
 * `ats-safe-single-column` is first because ADR-0008 says so, and because two things read position:
 *
 *   - `templateForPresentation` falls back to the first entry when a stored presentation names a
 *     template that is no longer registered. Templates will be removed — ADR-0008 is explicit that
 *     template count is not a competitive dimension — and a resume stored against a removed one must
 *     still open. Falling back to the safest layout rather than an arbitrary one is the difference
 *     between "your resume opened with a plainer font" and "your resume lost content".
 *   - A gallery that has not loaded a preference shows the first entry.
 *
 * # Adding a template is a two-sided change
 *
 * `PresentationTemplate` is a closed union and `PRESENTATION_TEMPLATES` is asserted against a fixture
 * generated from the Go constants. Adding an id here without adding it to `kratos-server` fails
 * `resume-presentation-parity.test.ts`, and the server would reject a save naming it. That is intended
 * (ADR-0004 rejected arbitrary strings in the presentation column), which is why this is a literal
 * list rather than a directory scan.
 *
 * A renderer for the id is required too, and that side *is* enforced by the type checker:
 * `RENDERERS` in `components/resume-render/index.ts` is keyed by {@link RegisteredTemplateId}.
 */
export const TEMPLATE_METADATA: readonly ResumeTemplateMetadata[] = [
  {
    id: 'ats-safe-single-column',
    name: 'ATS 安全单栏',
    description: '单栏、无图标、联系信息在正文中，机器解析友好度最高。投递大公司首选。',
    facets: ['campus', 'experienced', 'internship', 'referral', 'single-column'],
    parseability: 'high',
    // Every token here is chosen for the parser rather than for the eye: a serif face is the
    // conventional document face and has the widest set of installed substitutes, `lineHeight` 1.5 is
    // the least cramped value that still saves paper, and the margin is the default because a narrower
    // one makes some printers clip the edge. `accentColor` is inherited from `DEFAULT_PRESENTATION` —
    // the neutral stone brown, which is not a colour a user would object to receiving by default.
    tokens: {
      fontFamily: 'serif',
      lineHeight: 1.5,
      pageMargin: '18mm',
    },
  },
  {
    id: 'classic-centred',
    name: '经典居中',
    description: '居中标题、彩色小标题与技能标签，观感更精致；机器解析友好度中等。',
    facets: ['experienced', 'campus', 'referral', 'single-column'],
    parseability: 'medium',
    // `lineHeight: 1.6` with `fontScale` left alone: the pre-refactor view used 1.6 at the root, and
    // preserving it is what makes "no user loses the layout they had" true rather than approximately
    // true. The margin is slightly wider than the ATS-safe template's, which is a difference a reader
    // notices on paper — less text per page, more white space.
    tokens: {
      fontFamily: 'serif',
      lineHeight: 1.6,
      pageMargin: '20mm',
    },
  },
  {
    id: 'verdant-banner',
    name: '绿野通栏',
    description: '鼠尾草绿通栏色块、主色小标题与技能标签，气质温润；机器解析友好度中等。',
    facets: ['experienced', 'campus', 'referral', 'single-column'],
    // 中 against the written table, and the reasoning belongs here rather than only in the renderer:
    // `PARSEABILITY_CRITERIA`'s 中 row is 「单栏但含装饰元素」, which is what this is — one column, with a
    // decorative heading bar and two low-opacity rings. What keeps it out of 低 is the same table's
    // long-form criterion for that rating: the contacts are not *inside a graphic*, they are DOM text
    // over a CSS background, so a text-layer extractor reads every labelled value. The cost is the
    // positional signal an image-based extractor loses, which is exactly a 中-sized cost.
    // See `components/resume-render/verdant.tsx` for the full judgement.
    parseability: 'medium',
    // The tokens that make this template recognisable without a renderer in hand: a sans face, since a
    // colour-block banner with a serif body reads as a mismatch, and the same 1.6/20mm rhythm the
    // classic template uses so a switch between the two does not change the page count.
    //
    // Accent is *not* a token. The wizard's colour row is one shared palette, the product default is a
    // colour the user can pick again, and a template brand colour would make that click look like a
    // no-op (`resolveTemplate` treats the default as "no opinion"). The banner still paints whatever
    // accent the resume carries — it just no longer ships one of its own.
    //
    // 证件照, and why the rating above is unaffected by it: the renderer honours `photo.enabled` (a user
    // who turned the photo on keeps it — ADR-0008 §「`photo` 是合并，不是二选一」), but this template
    // **builds in no photo slot**. Nothing is reserved and no frame is drawn when the flag is off, and
    // when it is on the portrait is added beside the text without changing the document's structure:
    // one column, same order, same headings. The 低 row's 证件照 trait describes the other thing — a
    // layout designed around a face, where the photo is part of the page's structure — so a photo the
    // user asked for does not move this template down a rating.
    tokens: {
      fontFamily: 'sans',
      lineHeight: 1.6,
      pageMargin: '20mm',
    },
  },
];

/** The ids above, so a renderer cannot be registered for a template that is not described here. */
export type RegisteredTemplateId = (typeof TEMPLATE_METADATA)[number]['id'];

/** The template a resume with no stored presentation is drawn with: the first, safest entry. */
export const DEFAULT_TEMPLATE_METADATA: ResumeTemplateMetadata = TEMPLATE_METADATA[0]!;

/**
 * What presentation resolution actually needs of a template: its identity and the styling it imposes.
 *
 * Every function below is typed over this rather than over {@link ResumeTemplate} so that a caller
 * holding only metadata — the starter catalogue, a gallery — can resolve a presentation without
 * importing a renderer. It is the same reason the registry is split in two.
 */
export type TemplateLike = Pick<ResumeTemplate, 'id' | 'tokens'>;

/**
 * Resolve the presentation to render with: the template's tokens as the baseline, the user's
 * choices over them, and finally the template being rendered stamped on top.
 *
 * # Precedence, stated precisely
 *
 *   1. **`DEFAULT_PRESENTATION`** — the product's defaults.
 *   2. **The template's tokens** — the baseline, for every field the user has not decided.
 *   3. **The user's stored presentation** — wins wherever it actually says something.
 *   4. **`template.id`** — always wins, because it names what is being rendered.
 *
 * # The trap, and why step 3 needs the default test
 *
 * The read route does not answer `null` for a resume with nothing saved. It answers
 * `DEFAULT_PRESENTATION` — a **complete** object, because ticket 19's `presentationFromRecord` fills
 * every field and the server does the same. So "the user stored nothing" and "the user stored the
 * defaults" are the same payload, and a straightforward per-field merge cannot tell them apart.
 *
 * Merge unconditionally and the template's tokens are **dead code that looks alive**: `stored`
 * supplies every field, so `lineHeight: 1.6` in a template is never consulted, every template renders
 * in the default brown at the default margin, and the only way to notice is to look at two resumes
 * side by side. That is precisely the ADR-0008 defect — 模板看起来不同，实际相同 — one layer down
 * from where it was fixed.
 *
 * So the rule is: **tokens apply where the stored value has not diverged from the default.** A field
 * the user has actually changed differs, and wins. A field still sitting at the default carries no
 * information about intent, and the template's opinion is the more specific one.
 *
 * The unavoidable cost is that a user who deliberately sets a field to the default value cannot
 * outvote a template that disagrees. That is the right way round: the failure mode of the opposite
 * choice is a template system in which no template does anything.
 *
 * # Two fields are handled specially
 *
 *   - **`photo`** is merged rather than replaced. "The user picked a photo" and "the template wants a
 *     photo" are independent facts, so `{enabled: true, path: null}` from a template takes the
 *     resume's existing photo rather than the template's emptiness discarding the user's choice.
 *   - **`template`** always comes from the template argument. A stored id naming a template that has
 *     since been removed must not be able to outvote the registry, or the resume would keep claiming
 *     a layout nothing can draw.
 *
 * # Why not merge by hand, field by field
 *
 * `presentationFromRecord` is the only code that knows which of a field's values count as a usable
 * decision — it applies the same bounds the server does, so a corrupt column (a margin of `900mm`, a
 * font scale of 12) falls back instead of producing a broken page. Re-implementing that here would
 * be a second, weaker copy of the validation.
 */
export function resolveTemplate(template: TemplateLike, stored: unknown): ResumePresentation {
  // Resolve the stored value against the product defaults first. This validates it — the same bounds
  // the server applies — so everything below compares two known-good values.
  const resolved = presentationFromRecord(stored, template.tokens);
  const tokens = template.tokens;

  // A field still sitting at the default carries no information about intent, so the template's
  // opinion is the more specific one. A field that differs was chosen, and wins. See the note above
  // on why this cannot be decided per object instead of per field.
  const pick = <T,>(value: T, fallback: T, token: T | undefined): T =>
    value === fallback ? (token ?? fallback) : value;

  // `photo` is merged rather than picked between, because "the user picked a photo" and "the template
  // wants a photo" are independent facts, and because the two sources can be combined usefully: a
  // template can turn a photo on without discarding the one the resume already carries.
  //
  // `enabled` is read from the raw stored value, not from `resolved`. An enabled-but-pathless photo is
  // dropped by `presentationFromRecord` — it must be, since an enabled photo with no source renders a
  // broken image — which erases the *intent*. That intent is exactly what has to survive here: it is
  // the whole content of "the user turned the photo on and has not chosen a file yet".
  const storedPhotoEnabled = readStoredPhotoEnabled(stored);
  const photoEnabled =
    storedPhotoEnabled ??
    (resolved.photo.enabled !== DEFAULT_PRESENTATION.photo.enabled
      ? resolved.photo.enabled
      : (tokens.photo?.enabled ?? resolved.photo.enabled));
  const photoPath = resolved.photo.path ?? tokens.photo?.path ?? null;

  return {
    schemaVersion: resolved.schemaVersion,
    template: template.id,
    accentColor: pick(resolved.accentColor, DEFAULT_PRESENTATION.accentColor, tokens.accentColor),
    fontFamily: pick(resolved.fontFamily, DEFAULT_PRESENTATION.fontFamily, tokens.fontFamily),
    fontScale: pick(resolved.fontScale, DEFAULT_PRESENTATION.fontScale, tokens.fontScale),
    lineHeight: pick(resolved.lineHeight, DEFAULT_PRESENTATION.lineHeight, tokens.lineHeight),
    pageMargin: pick(resolved.pageMargin, DEFAULT_PRESENTATION.pageMargin, tokens.pageMargin),
    // Never templated: reordering a candidate's sections is an editorial act about their content, and
    // `PresentableFields` excludes it for that reason.
    sectionOrder: resolved.sectionOrder,
    photo: { enabled: photoEnabled, path: photoPath },
  };
}

/**
 * The stored photo's `enabled` flag, or `null` when the stored value does not state one.
 *
 * Read from the raw input rather than from a resolved `ResumePresentation` because resolution is
 * lossy by design: an enabled photo with no path is dropped (it would render a broken image), which
 * also discards the fact that the user turned it on. `null` and `false` are different answers here —
 * `false` is a choice to suppress the photo, `null` is silence that a template may fill.
 */
function readStoredPhotoEnabled(stored: unknown): boolean | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const photo = (stored as { photo?: unknown }).photo;
  if (typeof photo !== 'object' || photo === null) return null;
  const enabled = (photo as { enabled?: unknown }).enabled;
  return typeof enabled === 'boolean' ? enabled : null;
}

/**
 * Resolve a presentation for an optional template.
 *
 * Used by callers that may not have a template in hand — a list of template ids from an API, a
 * registry that failed to match. Falls back to the default presentation, which is always a valid
 * thing to render.
 */
export function presentationFor(template: TemplateLike | undefined, stored: unknown): ResumePresentation {
  return template ? resolveTemplate(template, stored) : presentationFromRecord(stored);
}

/** Look a template up by id. Returns `undefined` rather than throwing — callers decide what a miss means. */
export function findTemplate<T extends { id: string }>(
  id: string,
  templates: readonly T[]
): T | undefined {
  return templates.find((template) => template.id === id);
}

/**
 * The template to render a stored presentation with.
 *
 * Three cases, in order of how much the caller knows:
 *
 *   1. The stored presentation names a registered template → use it. This is the normal path: the
 *      user picked a template and the server kept it.
 *   2. It names something unregistered → the first registered template. A stored id can be
 *      unregistered for a real reason: ADR-0008 says template count is not a competitive
 *      dimension, so templates will be removed, and a resume stored against a removed one must
 *      still open. Falling back to the first entry is right because the registry is ordered with
 *      the ATS-safe template first (ADR-0008: safe first, or users default to the pretty one and
 *      silently lose content).
 *   3. An empty registry → throw. This is a programming error, and it cannot be papered over: there
 *      is no presentation that renders without a renderer. Failing loudly here means
 *      "forgot to register the ATS-safe template" surfaces during development rather than as a
 *      blank page in front of a user.
 */
export function templateForPresentation<T extends TemplateLike>(
  stored: ResumePresentation,
  templates: readonly T[]
): T {
  const named = findTemplate(stored.template, templates);
  if (named) return named;

  const first = templates[0];
  if (!first) {
    throw new Error('模板注册表为空：至少需要一套模板才能渲染简历');
  }
  return first;
}

/**
 * The order of `PresentableFields` keys, for a UI that lists what a template changes.
 *
 * Declared rather than derived from `Object.keys` of a token object, because a template with no
 * tokens would then report no fields, and the point of the list is to enumerate what *could* differ.
 * Typed as a total record so adding a field to `PresentableFields` fails the build here instead of
 * silently leaving the list short.
 */
export const PRESENTABLE_FIELD_ORDER: readonly (keyof PresentableFields)[] = [
  'template',
  'accentColor',
  'fontFamily',
  'fontScale',
  'lineHeight',
  'pageMargin',
  'photo',
] as const satisfies readonly (keyof PresentableFields)[];

/** Chinese labels for the fields a template may set, for the style panel and template details. */
export const PRESENTABLE_FIELD_LABELS: Record<keyof PresentableFields, string> = {
  template: '版式',
  accentColor: '主色',
  fontFamily: '字体',
  fontScale: '字号',
  lineHeight: '行距',
  pageMargin: '页边距',
  photo: '证件照',
};

/**
 * `photo` is the one `PresentableFields` member whose value is an object, so a UI diffing tokens
 * against the user's choices needs to compare it by value rather than by reference. Centralised
 * here so the two panels that will need it (ticket 24's style panel, ticket 22's gallery) agree.
 */
export function sameTokens(a: PresentationTokens, b: PresentationTokens): boolean {
  const aPhoto = a.photo ?? null;
  const bPhoto = b.photo ?? null;
  const photoEqual =
    aPhoto === bPhoto ||
    (aPhoto !== null &&
      bPhoto !== null &&
      aPhoto.enabled === bPhoto.enabled &&
      aPhoto.path === bPhoto.path);

  return (
    photoEqual &&
    a.template === b.template &&
    a.accentColor === b.accentColor &&
    a.fontFamily === b.fontFamily &&
    a.fontScale === b.fontScale &&
    a.lineHeight === b.lineHeight &&
    a.pageMargin === b.pageMargin
  );
}
