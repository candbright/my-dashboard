'use client';

/**
 * The print/preview view of a resume, as a thin dispatcher over the template registry
 * (ticket 20, ADR-0008).
 *
 * # What this file used to be, and why it is now this
 *
 * It was 308 lines that *were* the print design: a fixed 794px page, a centred header, a ruled
 * section heading, an entry with a right-aligned date, and a skill chip — all written out in inline
 * styles in this one file. The presentation state that ticket 19 built (`ResumePresentation`, six
 * accent colours, font scale, line height, page margin, photo toggle) could not reach any of it,
 * because there was nowhere to pass it.
 *
 * Now the file's whole job is three lines of decision: read the presentation off the record, pick
 * the renderer that owns it, hand it the data. Everything visual lives in a template, and the page
 * shell and section primitives are shared (`components/resume-render/`).
 *
 * # The public props are unchanged, deliberately
 *
 * `export-pdf.tsx` mounts this into an off-screen root and measures the result, and
 * `ResumePageClient` renders it inside the preview frame. Both call sites keep working untouched,
 * which is why this refactor did not need to touch the export pipeline at all. The presentation
 * comes from `resume.presentation`, which the detail route already returns.
 *
 * # Why the resolution goes through the registry rather than a switch
 *
 * A `switch (presentation.template)` here would put the template list in two places — once in the
 * registry, once in this file — and the failure mode of them disagreeing is a stored resume that
 * renders as blank or as the wrong template with no error. `templateForPresentation` owns the
 * fallback and throws if the registry is empty, so "no renderer" cannot be a silent outcome.
 *
 * # The template's tokens are applied here, and this is where the ADR-0008 defect was (ticket 48)
 *
 * This component used to compute its styling as `presentationFromRecord(resume.presentation)` and
 * stop there. That function's job is to fill **every** field, so it answered a complete object that
 * had never consulted the template: every template rendered in the product's default stone brown at
 * the default 1.5 line height, and a template's own tokens (`verdant-banner`'s sage and sans face,
 * `classic-centred`'s looser line height) were **dead code that looked alive**. ADR-0008 §1 describes
 * exactly this — 每套模板都会渲染成同一种棕色 — and it was reachable from both paths, because this is
 * what `export-pdf` renders *and* what the editor's preview renders.
 *
 * `presentationFor` is `resolveTemplate`, which owns the ADR-0008 rule: the template's tokens are the
 * baseline, and the user's stored value wins wherever it has actually diverged from the default (a
 * field still sitting at the default carries no intent). `photo` is merged rather than chosen between,
 * and `template` always comes from the registry. Re-implementing any of that here would be a second,
 * weaker copy — the module documents why the rule has to be per field rather than per object.
 */

import { RESUME_TEMPLATES } from '@/components/resume-render';
import {
  presentationFromRecord,
  type ResumePresentation,
} from '@/lib/resume-presentation';
import { presentationFor, templateForPresentation } from '@/lib/resume-template';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';

interface ResumePrintViewProps {
  resume: ResumeRecord;
  /**
   * Must be metadata-normalised — see the same prop on `ResumeDisplay`. This view is
   * what `exportResumePdf` / `exportResumeImage` render, so a loose frontmatter here
   * means a PDF that silently drops the candidate's contact details.
   */
  parsed: ParsedResumeWithMetadata;
  /**
   * Override the stored presentation.
   *
   * Not needed by the export path, which renders exactly what is saved. It exists for the style
   * panel (ticket 24), which has to preview an unsaved change — and previewing it through the real
   * renderer rather than a mock is the only way the preview can be trusted to match the PDF.
   */
  presentation?: ResumePresentation;
}

/**
 * A static (no-animation) view of the resume, sized and styled for PDF capture.
 *
 * Static is a requirement, not a preference: `export-pdf.tsx` waits a fixed 800 ms for layout to
 * settle and then measures block heights. Anything that animates in would be measured mid-flight,
 * so a page break could be computed from a height the document never actually has.
 */
export function ResumePrintView({ resume, parsed, presentation }: ResumePrintViewProps) {
  // The styling to honour: the caller's override when there is one (the style panel and the creation
  // wizard both preview a choice that has not been saved), otherwise the stored column.
  const stored = presentation ?? resume.presentation;
  // Read once, for the registry lookup only: `templateForPresentation` needs a resolved object to read
  // `template` from, and a stored column is untrusted JSON.
  const template = templateForPresentation(presentationFromRecord(stored), RESUME_TEMPLATES);
  // Then resolve: the template's tokens as the baseline, the stored values over them (see the note on
  // this file). Passing an already-resolved presentation through here is idempotent, which is why the
  // override does not need its own branch.
  const resolved = presentationFor(template, stored);

  return template.render({
    content: parsed,
    metadata: { frontmatter: parsed.frontmatter },
    presentation: resolved,
    // The print document is the paper impression of the resume: a fixed A4 column, no screen chrome.
    mode: 'print',
    fallbackTitle: resume.title,
  });
}
