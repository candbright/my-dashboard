/**
 * Resume metadata as a set of editable columns (ticket 15, ADR-0003).
 *
 * # Why this module exists
 *
 * Metadata used to live inside the document's YAML frontmatter, and the editor edited it by
 * rebuilding that frontmatter. ADR-0003 moved the authority to database columns, so the form
 * now reads and writes columns directly — and that needs three things this module provides:
 *
 *  1. **One mapping** from the domain's column names (`job_title`) to the form's labels and
 *     input types. Previously that mapping was implicit: the key was `title` in the
 *     frontmatter and `job_title` in the column, and the two were reconciled by hand at each
 *     site. A second copy of that reconciliation is how a field silently stops saving.
 *  2. **Client-side validation** that mirrors the server's rules, so a typo is caught before
 *     a round trip. The server still validates — this is convenience, not enforcement.
 *  3. **A patch representation** that can express "leave this alone" and "clear this"
 *     separately, which is the whole reason the endpoint takes a map.
 *
 * # The patch contract
 *
 * `undefined` means *leave the column untouched*; `''` means *clear it*. They are not
 * interchangeable: `{ phone: undefined }` is a request that changes nothing, and
 * `{ phone: '' }` deletes the phone number. JSON serialisation is what makes this work —
 * `JSON.stringify` drops `undefined` properties, so absence survives the wire intact.
 *
 * Getting this wrong is invisible: a form that sent `''` for every untouched field would
 * silently wipe anything the user did not edit, and every test that only checked the edited
 * field would still pass.
 */

/**
 * The metadata field keys, matching the server's column names exactly.
 *
 * `job_title`, not `title`: the column is `job_title`, and the frontmatter key `title` does
 * not exist server-side. The label shown to users is 「职位」 regardless.
 */
export type MetadataKey =
  | 'name'
  | 'job_title'
  | 'email'
  | 'phone'
  | 'location'
  | 'website'
  | 'github'
  | 'linkedin'
  | 'avatar'
  | 'summary';

/** A partial update: absent keys are left alone, empty strings clear. */
export type ResumeMetadataPatch = Partial<Record<MetadataKey, string>>;

/** The full set of metadata values, as a form holds them. */
export type ResumeMetadataValues = Record<MetadataKey, string>;

/**
 * One editable field: its key, label, and how the form should present it.
 *
 * `type: 'url'` and `'email'` drive both the browser's own soft validation and the
 * `inputMode` on touch keyboards, which is why they are declared rather than inferred from
 * the key.
 */
export interface MetadataFieldSpec {
  key: MetadataKey;
  label: string;
  placeholder: string;
  type: 'text' | 'email' | 'url' | 'textarea';
  /** Spans both columns in the two-column form. Used for free text and the summary. */
  wide?: boolean;
  /** Shown under the field as a hint. */
  hint?: string;
}

/**
 * The fields, in presentation order.
 *
 * This order is load-bearing: it is the form's layout, and it is the order client-side
 * validation reports errors in — so the first error the user sees is the topmost one on
 * screen. The server validates in the same order for the same reason.
 */
export const METADATA_FIELDS: readonly MetadataFieldSpec[] = [
  { key: 'name', label: '姓名', placeholder: '张三', type: 'text' },
  { key: 'job_title', label: '职位', placeholder: '全栈开发工程师', type: 'text' },
  { key: 'email', label: '邮箱', placeholder: 'name@example.com', type: 'email' },
  { key: 'phone', label: '电话', placeholder: '+86 138-0000-0000', type: 'text' },
  { key: 'location', label: '地点', placeholder: '北京市', type: 'text' },
  { key: 'website', label: '网站', placeholder: 'https://example.com', type: 'url' },
  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/username', type: 'url' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/username', type: 'url' },
  { key: 'avatar', label: '头像链接', placeholder: 'https://example.com/avatar.jpg', type: 'url' },
  { key: 'summary', label: '个人简介', placeholder: '一句话介绍你的专业背景', type: 'textarea', wide: true },
] as const;

/** Just the keys, in the same order. Derived so the two cannot disagree. */
export const METADATA_KEYS: readonly MetadataKey[] = METADATA_FIELDS.map((f) => f.key);

/**
 * The link-typed fields: the ones rendered as an `href`, or as an image source.
 *
 * Derived from the field specs' own `type: 'url'`, so adding a link field to the form cannot leave
 * the two rules that care about links behind. Both of them read this list:
 * `validateMetadataField` (what to complain about) and `metadataValuesWithoutInvalidUrls` (what to
 * drop before the form ever sees it).
 */
export const METADATA_URL_KEYS: readonly MetadataKey[] = METADATA_FIELDS.filter(
  (f) => f.type === 'url'
).map((f) => f.key);

/**
 * A field's label, for an error message that must name it.
 *
 * Falls back to the key rather than throwing: an error message reading `job_title` is worse
 * than 「职位」 but far better than a blank or a crash.
 */
export function metadataLabel(key: MetadataKey): string {
  return METADATA_FIELDS.find((f) => f.key === key)?.label ?? key;
}

/** Length limits, matching the server's (`metadata_validation.go`). */
export const METADATA_MAX_LENGTH: Partial<Record<MetadataKey, number>> = {
  name: 100,
  job_title: 100,
  location: 100,
  phone: 50,
  summary: 2000,
  email: 254,
  website: 500,
  github: 500,
  linkedin: 500,
  avatar: 500,
};

/**
 * A deliberately loose email check, mirroring the server's.
 *
 * # Why not a strict pattern
 *
 * The full RFC 5322 grammar accepts comments, quoted strings, and domain literals, and
 * every implementation of it rejects addresses that work in practice. Refusing a real
 * address is the worst outcome here, because the user cannot fix it — they are typing their
 * actual email. "One `@`, a non-empty local part, a dotted domain, no spaces" catches the
 * typos that matter, and delivery is the only real proof anyway.
 *
 * Kept deliberately identical in spirit to the Go implementation so the two cannot disagree
 * about what is acceptable — a client that accepts what the server rejects produces an error
 * message the user cannot act on.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

/**
 * Whether a link field holds something acceptable.
 *
 * A scheme-less value like `example.com` is **accepted**: that is what people type, and the
 * renderer prepends `https://`. Rejecting it would produce a message the user cannot act on.
 *
 * A scheme, when present, must be http or https. `javascript:` and `data:` are refused
 * because these values become `href`s and, on the export path, appear inside a PDF — a scheme
 * that executes is a hazard, not a formatting preference.
 *
 * Exported for testing; prefer `validateMetadataField`.
 */
export function isAcceptableMetadataUrl(value: string): boolean {
  if (/[\s]/.test(value)) return false;

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(value);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return false;
    const afterScheme = value.slice(schemeMatch[0].length);
    const host = stripPortAndSuffix(afterScheme);
    return isDottedHost(host);
  }

  // No `://`. Reject anything that still looks like a scheme, which is how a dangerous one
  // arrives when written without slashes: `javascript:alert(1)`, `data:text/html,...`,
  // `mailto:a@b.c`. A single colon is enough to tell — a bare domain never has one — except
  // for a port, which is accepted explicitly so `example.com:8080` is not a false rejection.
  const colon = value.indexOf(':');
  if (colon >= 0) {
    const after = value.slice(colon + 1);
    if (after === '' || !/^\d+$/.test(after)) return false;
  }

  return isDottedHost(stripPortAndSuffix(value));
}

/** Everything before the path, query, fragment, or port. */
function stripPortAndSuffix(value: string): string {
  let host = value;
  const suffix = host.search(/[/?#]/);
  if (suffix >= 0) host = host.slice(0, suffix);
  const port = host.indexOf(':');
  if (port >= 0) host = host.slice(0, port);
  return host;
}

/** A host with a dot, not starting or ending with one. */
function isDottedHost(host: string): boolean {
  return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
}

/**
 * Validate one field's value.
 *
 * Returns the ready-to-display Chinese message, or `null` when acceptable.
 *
 * An empty value is always acceptable: clearing a field is a normal edit, not a malformed
 * one. Callers pass the **raw** value; whitespace-only is treated as empty because clearing
 * a field by selecting all and deleting commonly leaves a space.
 */
export function validateMetadataField(key: MetadataKey, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  const max = METADATA_MAX_LENGTH[key];
  // Counted in code points, matching the server's rune count. `String.length` counts UTF-16
  // units, so an emoji would count as two and a Chinese character as one — which would put
  // the client and the server two units apart on exactly the values this project's users
  // type.
  if (max !== undefined && [...trimmed].length > max) {
    if (key === 'email') return '邮箱过长，请检查后重试';
    if (METADATA_URL_KEYS.includes(key)) {
      return '链接过长，请检查后重试';
    }
    return `${metadataLabel(key)}过长，请控制在 ${max} 字以内`;
  }

  if (key === 'email' && !EMAIL_PATTERN.test(trimmed)) {
    return '邮箱格式不正确，示例：name@example.com';
  }

  if (METADATA_URL_KEYS.includes(key) && !isAcceptableMetadataUrl(trimmed)) {
    return '链接格式不正确，请以 http:// 或 https:// 开头';
  }

  return null;
}

/**
 * Validate a whole form, returning the first problem.
 *
 * First, not all: the form shows one error at a time next to its field, and the fields are
 * visited in presentation order so the reported error is the topmost one — the one the user
 * will reach first.
 *
 * Returns `null` when every field is acceptable.
 */
export function validateMetadataValues(
  values: Partial<Record<MetadataKey, string>>
): { key: MetadataKey; message: string } | null {
  for (const key of METADATA_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    const message = validateMetadataField(key, value);
    if (message) return { key, message };
  }
  return null;
}

/** All problems, keyed by field. Used to mark every offending input at once. */
export function collectMetadataErrors(
  values: Partial<Record<MetadataKey, string>>
): Partial<Record<MetadataKey, string>> {
  const errors: Partial<Record<MetadataKey, string>> = {};
  for (const key of METADATA_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    const message = validateMetadataField(key, value);
    if (message) errors[key] = message;
  }
  return errors;
}

/** A link the form would reject, with the value it held, so the user can be told what was ignored. */
export interface DroppedMetadataUrl {
  key: MetadataKey;
  value: string;
}

/**
 * Splits off link values the form would reject, so a parse cannot seed a field that cannot be saved.
 *
 * # The defect this exists to prevent
 *
 * An AI parse — and an imported `.md` — carries whatever the source document had. Asked for a
 * 简历, the model commonly echoes a path out of that document's own media folder, `images/X13.png`,
 * as the avatar. It is not a URL and never was: nothing can resolve it, because it is relative to a
 * file this product has never seen.
 *
 * Kept in the form, one such value does three kinds of damage at once:
 *
 *   - the panel marks a field the user never filled in「链接格式不正确，请以 http:// 或 https:// 开头」;
 *   - `handleSaveToServer` refuses to save **the whole resume** while any field is malformed, so a
 *     path the user did not type blocks 保存到平台 until they hunt the field down and clear it;
 *   - if it ever is saved, it lands in the `avatar` column and renders as a broken image on the
 *     resume itself.
 *
 * Dropping it where a machine's output becomes form values keeps those three apart. The rule is
 * `validateMetadataField` itself, so "the form would reject this" and "this was dropped" cannot
 * drift. **A human's typing is never touched**: this runs on parsed frontmatter only.
 *
 * `dropped` is returned rather than discarded because silently losing a value the document did
 * carry is its own defect — the caller is expected to say what it ignored.
 */
export function metadataValuesWithoutInvalidUrls(values: ResumeMetadataValues): {
  values: ResumeMetadataValues;
  dropped: DroppedMetadataUrl[];
} {
  const kept: ResumeMetadataValues = { ...values };
  const dropped: DroppedMetadataUrl[] = [];

  for (const key of METADATA_URL_KEYS) {
    const value = kept[key];
    if (value.trim() === '') continue;
    if (validateMetadataField(key, value) !== null) {
      dropped.push({ key, value: value.trim() });
      kept[key] = '';
    }
  }

  return { values: kept, dropped };
}

/**
 * What to tell the user about dropped links, or `null` when there is nothing to say.
 *
 * Names the field *and* quotes the value. 「已忽略」 without either is a change the user cannot
 * account for — the point of dropping the value was to remove an obstruction, not to hide one.
 */
export function invalidMetadataUrlNotice(dropped: DroppedMetadataUrl[]): string | null {
  if (dropped.length === 0) return null;

  const labels = dropped.map((entry) => metadataLabel(entry.key)).join('、');
  const values = dropped.map((entry) => entry.value).join('、');
  return `解析出的${labels}不是有效网址，已忽略：${values}。可在「基本信息」中改为 http:// 或 https:// 开头的地址。`;
}

/**
 * Read the metadata values out of a resume record.
 *
 * A `null` column becomes `''` rather than staying null, so the form has one representation
 * of "no value" and does not have to guard `value ?? ''` at every input. The server's
 * columns are nullable and an untouched resume has nulls in most of them.
 */
export function metadataValuesFromRecord(record: {
  name?: string | null;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  website?: string | null;
  github?: string | null;
  linkedin?: string | null;
  avatar?: string | null;
  summary?: string | null;
}): ResumeMetadataValues {
  const values = {} as ResumeMetadataValues;
  for (const key of METADATA_KEYS) {
    values[key] = record[key] ?? '';
  }
  return values;
}

/**
 * Fill the metadata form from a {@link ResumeMetadataView}.
 *
 * The view is keyed by frontmatter names (`title`); the form is keyed by column
 * names (`job_title`). That is the same asymmetry `resumeMetadataView` reconciles
 * in the other direction, and writing it here once is what stops a create-flow
 * preview from showing a job title the form cannot edit.
 *
 * Blank view fields become `''`, matching {@link metadataValuesFromRecord}, so the
 * form has one representation of "no value" whether it was seeded from columns or
 * from an imported document.
 */
export function metadataValuesFromView(
  view: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    github?: string;
    linkedin?: string;
    avatar?: string;
  },
  extras?: { summary?: string }
): ResumeMetadataValues {
  return {
    name: view.name ?? '',
    job_title: view.title ?? '',
    email: view.email ?? '',
    phone: view.phone ?? '',
    location: view.location ?? '',
    website: view.website ?? '',
    github: view.github ?? '',
    linkedin: view.linkedin ?? '',
    avatar: view.avatar ?? '',
    summary: extras?.summary ?? '',
  };
}

/**
 * Build the patch that turns `original` into `edited`.
 *
 * # Why the diff, rather than sending the whole form
 *
 * Sending every field would make the request say "set all ten columns to these values" when
 * the user changed one. Two consequences, both bad:
 *
 *  - A field the user did not touch but that **another tab or the AI changed** in the
 *    meantime would be reverted to the value this form loaded. The optimistic lock would
 *    catch a same-version race, but this is a real regression vector for anything that
 *    writes metadata without moving the version the form holds.
 *  - The request would be a whole-row write wearing a patch's clothes, which is exactly the
 *    mistake that made form edits impossible before ticket 17.
 *
 * Only changed keys appear. A changed-to-empty field appears as `''` (a clear), and an
 * unchanged field does not appear at all — the distinction the server relies on.
 */
export function metadataPatchFromDiff(
  original: Partial<Record<MetadataKey, string>>,
  edited: Partial<Record<MetadataKey, string>>
): ResumeMetadataPatch {
  const patch: ResumeMetadataPatch = {};
  for (const key of METADATA_KEYS) {
    const before = original[key] ?? '';
    const after = edited[key];
    if (after === undefined) continue;
    if (before !== after) patch[key] = after;
  }
  return patch;
}

/** Whether a patch would change anything, i.e. whether it is worth a request. */
export function isMetadataPatchEmpty(patch: ResumeMetadataPatch): boolean {
  return Object.keys(patch).length === 0;
}
