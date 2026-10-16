/**
 * The wizard's style state and the create contract (ticket 48).
 *
 * Two things are pinned here, and they fail for different reasons:
 *
 *   1. **The state transitions** — which template is the default, and that changing the template keeps
 *      the colour. Getting the keep wrong is silent: the gallery would simply paint the new template
 *      in a colour the user never asked for.
 *   2. **The create payload.** `POST /api/resumes` accepts a `presentation` field holding the whole
 *      object, camelCase, with **no** `version` — the create route has no optimistic lock and refuses
 *      the envelope with 400 `INVALID_PRESENTATION`. This is the frontend half of a contract the Go
 *      route already tests from its side, so the assertion is on the parsed field rather than on the
 *      string: a key added or dropped must fail here rather than in production on a user's first save.
 */

import { describe, expect, it } from 'vitest';
import {
  creationAccent,
  creationPresentation,
  creationPresentationField,
  creationTemplate,
  defaultCreationStyle,
  defaultCreationTemplate,
  selectCreationAccent,
  selectCreationTemplate,
  templateAccent,
} from '@/lib/resume-creation';
import {
  DEFAULT_PRESENTATION,
  PRESENTATION_PALETTE,
} from '@/lib/resume-presentation';
import { TEMPLATE_METADATA } from '@/lib/resume-template';

/** The nine keys the create route's decoder accepts — no `version`, which belongs to the PATCH route. */
const PRESENTATION_KEYS = [
  'schemaVersion',
  'template',
  'accentColor',
  'fontFamily',
  'fontScale',
  'lineHeight',
  'pageMargin',
  'sectionOrder',
  'photo',
];

describe('the wizard starts on the ATS-safe template', () => {
  it('defaults to the first registered template', () => {
    // ADR-0008: the safe template is first *because* it is the default. Reading position 0 rather
    // than naming an id is what keeps a third template from quietly becoming the default.
    expect(defaultCreationTemplate().id).toBe(TEMPLATE_METADATA[0]?.id);
    expect(defaultCreationTemplate().id).toBe('ats-safe-single-column');
    expect(defaultCreationStyle().templateId).toBe('ats-safe-single-column');
  });

  it('resolves every registered template, including any appended later', () => {
    // The gallery reads the registry, so nothing here may enumerate templates by name: a template
    // added by another workstream has to appear, and a lookup that quietly fell back to the default
    // would show it under the wrong name.
    for (const template of TEMPLATE_METADATA) {
      expect(creationTemplate(template.id).id).toBe(template.id);
    }
  });

  it('falls back to the safest template for an id that is not registered', () => {
    expect(creationTemplate('no-such-template').id).toBe('ats-safe-single-column');
  });
});

describe('the initial colour is the product default', () => {
  it('starts on the default swatch, not a template brand colour', () => {
    expect(defaultCreationStyle().accentColor).toBe(DEFAULT_PRESENTATION.accentColor);
  });

  it('falls back to the product default where a template states no accent', () => {
    expect(templateAccent({ id: 'ats-safe-single-column', tokens: {} })).toBe(
      DEFAULT_PRESENTATION.accentColor
    );
  });

  it('starts every registered template in the same palette colour', () => {
    // The wizard no longer ships a per-template brand colour. The default swatch has to be a real
    // choice, which only holds if no registered template outvotes it via an accent token.
    const palette = PRESENTATION_PALETTE.map((entry) => entry.hex);

    for (const template of TEMPLATE_METADATA) {
      expect(template.tokens.accentColor, `${template.id} still ships an accent token`).toBeUndefined();
      expect(palette, `${template.id} starts off-palette`).toContain(templateAccent(template));
      expect(templateAccent(template)).toBe(DEFAULT_PRESENTATION.accentColor);
    }
  });
});

describe('changing the template keeps the colour', () => {
  it('keeps a colour the user already picked', () => {
    const [first, second] = TEMPLATE_METADATA;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const chosen = selectCreationAccent(
      { templateId: first!.id, accentColor: '#d4a373' },
      '#d4a373'
    );
    const switched = selectCreationTemplate(chosen, second!.id);

    expect(switched.templateId).toBe(second!.id);
    expect(switched.accentColor).toBe('#d4a373');
  });

  it('does not reset when the same template is chosen again', () => {
    // A stray click on the already-selected card must not undo a colour the user picked.
    const style = selectCreationAccent(defaultCreationStyle(), '#a64b45');

    expect(selectCreationTemplate(style, style.templateId)).toBe(style);
  });

  it('keeps the template when the colour changes', () => {
    const style = selectCreationAccent(defaultCreationStyle(), '#557a46');

    expect(style.templateId).toBe(defaultCreationStyle().templateId);
    expect(style.accentColor).toBe('#557a46');
  });
});

describe('the resolved accent is what the resume will really have', () => {
  it('lets the chosen colour win where it differs from the product default', () => {
    const style = { templateId: defaultCreationStyle().templateId, accentColor: '#c28a2e' };

    expect(creationAccent(style)).toBe('#c28a2e');
  });

  it('lets the product default win, including after switching templates', () => {
    // The default swatch is a real colour. No registered template ships an accent token, so picking
    // 石棕 again must paint 石棕 — including on 绿野通栏, which used to outvote it.
    for (const template of TEMPLATE_METADATA) {
      const style = { templateId: template.id, accentColor: DEFAULT_PRESENTATION.accentColor };
      expect(creationAccent(style)).toBe(DEFAULT_PRESENTATION.accentColor);
    }
  });
});

describe('the presentation the wizard builds', () => {
  it('applies the template’s tokens over the product defaults', () => {
    const template = TEMPLATE_METADATA.find((candidate) => candidate.tokens.lineHeight) ?? TEMPLATE_METADATA[0]!;
    const style = selectCreationTemplate(defaultCreationStyle(), template.id);
    const presentation = creationPresentation(style);

    expect(presentation.lineHeight).toBe(template.tokens.lineHeight ?? DEFAULT_PRESENTATION.lineHeight);
    expect(presentation.template).toBe(template.id);
    expect(presentation.schemaVersion).toBe(1);
    // Section order is never templated: reordering sections is an editorial act about the content.
    expect(presentation.sectionOrder).toEqual(DEFAULT_PRESENTATION.sectionOrder);
  });

  it('carries the template’s own accent when one is chosen later', () => {
    const style = selectCreationAccent(defaultCreationStyle(), '#557a46');

    expect(creationPresentation(style).accentColor).toBe('#557a46');
  });
});

describe('the create payload’s presentation field (ADR-0004, ticket 48)', () => {
  /** What the Go route decodes: `json.Unmarshal` of the field into the presentation struct. */
  function decode(style = defaultCreationStyle()): Record<string, unknown> {
    return JSON.parse(creationPresentationField(style)) as Record<string, unknown>;
  }

  it('is the complete object, with exactly the nine keys the create route accepts', () => {
    const parsed = decode();

    expect(Object.keys(parsed).sort()).toEqual([...PRESENTATION_KEYS].sort());
  });

  it('carries no version envelope, which the create route refuses', () => {
    // `presentationWriteBody` adds `version` because `PATCH …/presentation` compares it. Reusing that
    // helper here would produce a 400 INVALID_PRESENTATION on every creation, so the absence is
    // asserted rather than assumed.
    expect(decode()).not.toHaveProperty('version');
    expect(creationPresentationField(defaultCreationStyle())).not.toContain('"version"');
  });

  it('names the chosen template and the resolved colour', () => {
    const style = selectCreationTemplate(defaultCreationStyle(), 'classic-centred');
    const parsed = decode(style);

    expect(parsed.template).toBe('classic-centred');
    expect(parsed.accentColor).toBe(creationAccent(style));
    expect(parsed.photo).toEqual({ enabled: false, path: null });
    expect(parsed.fontScale).toBe(1);
  });

  it('is a string a form field can hold', () => {
    const field = creationPresentationField(defaultCreationStyle());

    expect(typeof field).toBe('string');
    expect(field.startsWith('{')).toBe(true);
    // No `version`, and no nested envelope of any kind: the value *is* the presentation object.
    expect(field).not.toContain('presentation');
  });
});
