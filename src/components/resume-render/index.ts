/**
 * The template registry (ticket 20, ADR-0008): metadata from `lib/resume-template.ts`, paired with
 * the renderer that draws it.
 *
 * # Why the split is here and not in `lib/`
 *
 * A `ResumeTemplate` is metadata plus a `render` function. The metadata is data that the seed
 * catalogue and the gallery need; the renderer is a React component. Keeping both in one module meant
 * every reader of the metadata — `lib/resume-template-seeds.ts` included — pulled two `.tsx`
 * renderers into its module graph, and kept `lib/` from being a layer that components may depend on
 * rather than one that depends on components. `invariants/module-layers.test.ts` now asserts that
 * direction.
 *
 * # Adding a template is a two-sided change, enforced on both sides
 *
 * Add its metadata to `TEMPLATE_METADATA` (this fails `resume-presentation-parity.test.ts` unless the
 * id also exists server-side), then add its renderer to `RENDERERS` below. The second side is a
 * compile error until it is done, because the record is keyed by the registered ids.
 */

import { AtsSafeResume } from '@/components/resume-render/ats-safe';
import { ClassicResume } from '@/components/resume-render/classic';
import { VerdantResume } from '@/components/resume-render/verdant';
import {
  TEMPLATE_METADATA,
  type RegisteredTemplateId,
  type ResumeTemplate,
  type TemplateRenderer,
} from '@/lib/resume-template';

/**
 * The renderer for each registered template.
 *
 * Keyed by {@link RegisteredTemplateId} rather than listed in the same order as the metadata: a
 * template with no renderer cannot be rendered, so the omission must fail the build instead of
 * producing a registry entry whose `render` is `undefined`.
 */
const RENDERERS: Record<RegisteredTemplateId, TemplateRenderer> = {
  'ats-safe-single-column': AtsSafeResume,
  'classic-centred': ClassicResume,
  'verdant-banner': VerdantResume,
};

/** Every registered template, safest first — the metadata's order, which is load-bearing. */
export const RESUME_TEMPLATES: readonly ResumeTemplate[] = TEMPLATE_METADATA.map((metadata) => ({
  ...metadata,
  render: RENDERERS[metadata.id],
}));

/** The template a resume with no stored presentation is drawn with. */
export const DEFAULT_RESUME_TEMPLATE: ResumeTemplate = RESUME_TEMPLATES[0]!;
