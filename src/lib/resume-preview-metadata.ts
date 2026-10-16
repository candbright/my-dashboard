/**
 * Placeholder 个人信息 for the editor preview (ticket 48).
 *
 * # Why the preview does not show an empty header
 *
 * Step 3 of the wizard previews the **chosen template**, and a template's header treatment — where the
 * name sits, how the contacts are separated, whether there is a rule under them — is only visible if
 * there is a name and some contacts to draw. A user creating a resume from 空白创建 has typed nothing
 * yet, so without placeholders the preview's most important region is blank and the template looks
 * broken rather than empty.
 *
 * # Where the values come from, and why not from a new list
 *
 * They are the **form's own placeholders** (`METADATA_FIELDS`), which already exist for exactly this
 * purpose and are already the answer to "what does a value look like here". A second list would be a
 * second thing to keep in step with the metadata form.
 *
 * Which fields get one is derived too:
 *
 *   - a **URL** field is skipped. The contact line renders as plain text (`… · github.com/username`),
 *     so a placeholder link adds three fake URLs to the header and demonstrates nothing about the
 *     design; the fields are left out rather than filled with noise.
 *   - `summary` is skipped because it has no counterpart in the resume at all — it is the dashboard
 *     card's blurb, not document content (ADR-0003, see `resume-parser.ts`).
 *
 * # These values must never reach the saved document
 *
 * The save path builds the document from the **raw** form values (`resumeMarkdownExport` of
 * `resumeMetadataView(metadataValues)` in `ResumeBuilderPage`), and nothing here mutates its input.
 * This function exists only so the preview can be rendered; a placeholder that reached the stored
 * record would put 张三's contact details on somebody's resume.
 */

import {
  METADATA_FIELDS,
  type MetadataKey,
  type ResumeMetadataValues,
} from '@/lib/resume-metadata';

/**
 * The fields the preview fills in, derived from the form's own specs.
 *
 * Text and email fields only: everything the contact line prints as text, and nothing that would be
 * printed as a link or is not part of the document.
 */
export const PREVIEW_PLACEHOLDER_KEYS: readonly MetadataKey[] = METADATA_FIELDS.filter(
  (field) => field.type !== 'url' && field.key !== 'summary'
).map((field) => field.key);

/**
 * The form's values with the blank text fields filled in from their own placeholders.
 *
 * A value that is present is returned **untouched**, including one that differs from the placeholder
 * only in whitespace-padding — this fills gaps, it does not normalise what the user typed. Blank means
 * blank after trimming, matching `resumeMetadataView`'s own test for "absent".
 *
 * Returns a new record; the argument is never written to.
 */
export function previewMetadataValues(values: ResumeMetadataValues): ResumeMetadataValues {
  const filled = { ...values };

  for (const field of METADATA_FIELDS) {
    if (!PREVIEW_PLACEHOLDER_KEYS.includes(field.key)) continue;
    if (values[field.key].trim() !== '') continue;

    filled[field.key] = field.placeholder;
  }

  return filled;
}
