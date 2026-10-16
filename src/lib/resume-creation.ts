/**
 * The creation wizard's style state (ticket 48, ADR-0008, ADR-0004).
 *
 * # What lives here, and why it is not in the component
 *
 * Step 1 of the wizard chooses two things: the **视觉模板** and the **主色**. Three rules govern them,
 * and all three are decisions rather than rendering:
 *
 *   1. the first template in the registry (`ats-safe-single-column`) is the default, because ADR-0008
 *      makes the safe one first so nobody silently loses content in an ATS;
 *   2. the colour starts at the product default (`DEFAULT_PRESENTATION.accentColor`). Templates do not
 *      ship a brand colour of their own — the palette is one shared row, and the default swatch is a
 *      real choice, not "unspecified";
 *   3. **changing the template keeps the colour.** The colour is a property of the resume, not of the
 *      card, so switching layouts must not undo a swatch the user already picked (including the default).
 *
 * They are pure state transitions, so they are testable without a DOM, and putting them in a
 * component would make them assertions about rendered markup instead of about behaviour.
 *
 * # The accent goes through `resolveTemplate`, and that is not incidental
 *
 * The obvious implementation of the payload is to spread the defaults and the template's tokens by
 * hand. It would be wrong in a way that only shows up on a third template: `resolveTemplate`
 * implements ADR-0008's **field-level** rule — a value still equal to the product default carries no
 * intent, so the template's token wins (`resume-template.ts` explains why that direction is the
 * right one) — and a hand-written spread would either duplicate that rule or quietly contradict it.
 *
 * Accent is the exception to that field-level rule in this wizard: no registered template ships an
 * `accentColor` token, so the product default is a colour the user can pick again, and `resolveTemplate`
 * will not silently repaint it.
 *
 * # The create payload
 *
 * `POST /api/resumes` takes the styling as a multipart field named `presentation` holding the
 * **complete** object as JSON, camelCase, and **without** a `version` key: the create route has no
 * optimistic lock, and sending one is refused with 400 `INVALID_PRESENTATION`. `version` belongs to
 * `PATCH /api/resumes/{id}/presentation`, which is what `presentationWriteBody` builds — a different
 * contract, deliberately not reused here. {@link creationPresentationField} is this side of it.
 */

import {
  DEFAULT_PRESENTATION,
  type PresentationTemplate,
  type ResumePresentation,
} from '@/lib/resume-presentation';
import {
  TEMPLATE_METADATA,
  resolveTemplate,
  type ResumeTemplateMetadata,
  type TemplateLike,
} from '@/lib/resume-template';

/** What step 1 of the wizard has decided so far. */
export interface CreationStyle {
  /** The chosen 视觉模板 id. */
  templateId: PresentationTemplate;
  /**
   * The colour the user picked, as a palette hex.
   *
   * The *chosen* value, not necessarily the rendered one: see the module note on `resolveTemplate`.
   * {@link creationPresentation} is what turns it into the colour the resume will really have.
   */
  accentColor: string;
}

/**
 * The template the wizard starts on: the first registered, which ADR-0008 requires to be the
 * ATS-safe one. Read from the registry rather than named as a literal, so appending a template to it
 * cannot change which one is default.
 */
export function defaultCreationTemplate(): ResumeTemplateMetadata {
  const first = TEMPLATE_METADATA[0];
  if (!first) throw new Error('the template registry is empty');
  return first;
}

/**
 * The template with this id, or the default when the id is not registered.
 *
 * Never `undefined`: every caller is about to render or serialise the result, and "no template" is
 * not a state the wizard can act on. Falling back to the safest template is the same choice
 * `templateForPresentation` makes for a stored id that no longer exists.
 */
export function creationTemplate(id: string): ResumeTemplateMetadata {
  return TEMPLATE_METADATA.find((template) => template.id === id) ?? defaultCreationTemplate();
}

/**
 * The colour a template starts a resume with: its own token, or the product default.
 *
 * `tokens.accentColor` is absent on the templates that have no opinion, which is why this is a
 * fallback rather than a lookup.
 */
export function templateAccent(template: TemplateLike): string {
  return template.tokens.accentColor ?? DEFAULT_PRESENTATION.accentColor;
}

/** The wizard's initial state: the default template, in the product default colour. */
export function defaultCreationStyle(): CreationStyle {
  const template = defaultCreationTemplate();
  return { templateId: template.id, accentColor: DEFAULT_PRESENTATION.accentColor };
}

/**
 * Choose a template.
 *
 * The colour is left alone. It is a property of the resume, and a click on a different card must not
 * undo a swatch the user already picked — including the product default, which is a real colour in
 * the row rather than "unspecified".
 *
 * Re-selecting the template that is already chosen is a no-op.
 */
export function selectCreationTemplate(style: CreationStyle, templateId: string): CreationStyle {
  const template = creationTemplate(templateId);
  if (template.id === style.templateId) return style;

  return { ...style, templateId: template.id };
}

/** Choose a colour, keeping the template. */
export function selectCreationAccent(style: CreationStyle, accentColor: string): CreationStyle {
  return { ...style, accentColor };
}

/**
 * The complete 展示态 these choices produce — what the preview renders and what gets saved.
 *
 * `resolveTemplate` is the single implementation of "token baseline, user's choices over it, the
 * rendered template stamped on top", so the wizard, the editor preview, the thumbnail and the
 * stored record cannot each resolve this differently.
 */
export function creationPresentation(style: CreationStyle): ResumePresentation {
  return resolveTemplate(creationTemplate(style.templateId), { accentColor: style.accentColor });
}

/** The colour the resume will really render in, after the template's tokens have had their say. */
export function creationAccent(style: CreationStyle): string {
  return creationPresentation(style).accentColor;
}

/**
 * The `presentation` form field for `POST /api/resumes`.
 *
 * A JSON string of the whole object: nine camelCase keys, no `version`. `resume-creation.test.ts`
 * parses it back and asserts exactly that, because this is the frontend half of a contract the Go
 * create route already pins from its side, and the failure mode of getting it wrong is a 400 on the
 * user's first save.
 */
export function creationPresentationField(style: CreationStyle): string {
  return JSON.stringify(creationPresentation(style));
}
