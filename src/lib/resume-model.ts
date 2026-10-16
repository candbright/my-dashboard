/**
 * What a resume *is*, as every reader of one sees it: the section and item shapes, and the two
 * metadata shapes. A leaf module by design — it imports nothing.
 *
 * The vocabulary lives here rather than in `resume-parser.ts` because that parser is a deliberate,
 * non-authoritative duplicate of the Go one and is meant to be deleted once the server snapshot
 * covers every path (ADR-0003). The domain model is not going away, so putting it in the parser
 * made the retirement an 18-file rewrite instead of a deletion, and forced `resume-section.ts` to
 * import its vocabulary from the module that imports `resume-section.ts` back.
 */

/**
 * Metadata as read from a document's frontmatter: loose, because YAML is loose.
 *
 * Keyed by frontmatter names, not column names — note the asymmetry, the column is `job_title`
 * and the key is `title`. {@link resumeMetadataView} is the single place that reconciles the two.
 *
 * `unknown` rather than `string` on purpose: YAML parses `&张三` as a null anchor and `[张三]` as an
 * array, so a value that claims to be a string can be an object at runtime. Consumers that need
 * strings take a {@link ResumeMetadataView} instead.
 */
export interface ParsedFrontmatter {
  name?: unknown;
  title?: unknown;
  email?: unknown;
  phone?: unknown;
  location?: unknown;
  website?: unknown;
  github?: unknown;
  linkedin?: unknown;
  avatar?: unknown;
}

/**
 * Metadata whose every present value is a non-blank string.
 *
 * The database columns are `varchar`/`text` read through a JSON API, so every value reaching a
 * consumer really is a string. Naming that guarantee is what lets the render components put a
 * value straight into `src`/`href`/a text node instead of casting at twenty-odd use sites.
 */
export interface ResumeMetadataView {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  github?: string;
  linkedin?: string;
  avatar?: string;
}

/**
 * A parsed resume whose metadata is known to be the strict view.
 *
 * Aliased rather than a second interface so the two can never disagree about `sections`.
 */
export type ParsedResumeWithMetadata = Omit<ParsedResume, 'frontmatter'> & {
  frontmatter: ResumeMetadataView;
};

export interface ParsedResume {
  frontmatter: ParsedFrontmatter;
  sections: ResumeSection[];
  rawContent: string;
}

export interface ResumeSection {
  title: string;
  content: string;
  items: ResumeSectionItem[];
  /**
   * What kind of section this is, when the server said so.
   *
   * Absent on a document this client parsed itself — a draft in the builder, or a save response
   * from a server that sends no snapshot. Renderers must therefore treat `undefined` as "unknown"
   * and fall back to a title test rather than assuming a category, because assuming one renders an
   * unrecognised section in a shape that does not fit it.
   */
  kind?: SectionKind;
  /**
   * Mixed display components in document order: paragraph, entry, chip-group.
   *
   * Derived from the markdown body (see `resume-blocks.ts`). Optional because a server snapshot
   * still only ships `content` + `items`; the preview infers blocks from those when this is
   * absent. Present after a local parse so a mixed section keeps its order through the editor.
   */
  blocks?: ResumeSectionBlock[];
}

export type ResumeSectionBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'entry'; item: ResumeSectionItem }
  | { type: 'chips'; chips: string[] };

/**
 * The section categories the server reports.
 *
 * A string union rather than an enum because the wire value is a string: a newer server may send a
 * kind this build has never heard of, and that must degrade to `other` (render it plainly) instead
 * of failing to decode.
 */
export type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'other';

export interface ResumeSectionItem {
  title: string;
  subtitle?: string;
  date?: string;
  details: string[];
  description?: string;
}

/**
 * The parsed body as the server sends it (`GET /api/resumes/{id}`, ticket 18).
 *
 * Mirrors the proto `StructuredContent`. Declared with the **wire** names, because that is what
 * actually arrives; `sectionsFromStructuredContent` is the one place that maps them onto the
 * internal shape.
 */
export interface StructuredContent {
  sections?: StructuredSection[];
}

export interface StructuredSection {
  title?: string;
  content?: string;
  kind?: string;
  items?: StructuredItem[];
}

export interface StructuredItem {
  title?: string;
  subtitle?: string;
  date?: string;
  details?: string[];
}
