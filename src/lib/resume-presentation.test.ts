/**
 * `resumeWithPresentation`: the one place a reply's styling is folded into its record.
 *
 * # The defect these pin
 *
 * ADR-0004 carries presentation **beside** the record (`ResumeInfo` has no styling field), and the
 * components read `resume.presentation`. Nothing folded it, so a resume saved as 绿野通栏 opened in the
 * default template — silently, because a missing presentation resolves to the product default rather
 * than to an error.
 *
 * The cases below are written against the **real wire shape**, which is the part that went wrong
 * before: a test that hands over a camelCase object would pass against a server that never sends one.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENTATION,
  resumeWithPresentation,
  type ResumePresentation,
} from '@/lib/resume-presentation';

/** Exactly what the read route answers with: `protojson` spelling, snake_case keys. */
const WIRE_PRESENTATION = {
  schema_version: 1,
  template: 'verdant-banner',
  accent_color: '#8b9d77',
  font_family: 'sans',
  font_scale: 1,
  line_height: 1.6,
  page_margin: '20mm',
  section_order: ['关于我', '工作经历'],
  photo: { enabled: false, path: null },
};

const RECORD = { id: 'r1', title: '我的简历', version: 3 };

function folded(record: unknown, reply: unknown): ResumePresentation {
  return resumeWithPresentation(record as { presentation?: unknown }, reply).presentation;
}

describe('resumeWithPresentation', () => {
  it('folds the reply’s styling into the record, reading the wire spelling', () => {
    const got = folded(RECORD, WIRE_PRESENTATION);

    expect(got.template).toBe('verdant-banner');
    expect(got.accentColor).toBe('#8b9d77');
    expect(got.sectionOrder).toEqual(['关于我', '工作经历']);
    expect(got.pageMargin).toBe('20mm');
  });

  it('keeps every other field of the record', () => {
    const got = resumeWithPresentation(RECORD, WIRE_PRESENTATION);

    expect(got.id).toBe('r1');
    expect(got.title).toBe('我的简历');
    expect(got.version).toBe(3);
  });

  it('reads the camelCase spelling too, because the server has two encoders', () => {
    const got = folded(RECORD, { ...WIRE_PRESENTATION, accent_color: undefined, accentColor: '#557a46' });

    expect(got.accentColor).toBe('#557a46');
  });

  it('falls back to the record’s own styling when the reply carries none', () => {
    // `PUT` answers `{resume, markdown, content}` and no presentation. The page holds the styling
    // already, and passing it through is how a content save stops resetting the template.
    const onScreen = { ...RECORD, presentation: { ...DEFAULT_PRESENTATION, template: 'verdant-banner' } };

    expect(folded(onScreen, undefined).template).toBe('verdant-banner');
  });

  it('prefers the reply over the record when both exist', () => {
    // `PATCH /presentation` is the case: the server validates and may normalise, so its answer wins.
    const onScreen = { ...RECORD, presentation: { ...DEFAULT_PRESENTATION, accentColor: '#5c4033' } };

    expect(folded(onScreen, WIRE_PRESENTATION).accentColor).toBe('#8b9d77');
  });

  it('resolves to the product default when neither side has one', () => {
    // A resume saved before styling existed, and a server that predates ticket 19.
    expect(folded(RECORD, undefined)).toEqual(DEFAULT_PRESENTATION);
    expect(folded(RECORD, null)).toEqual(DEFAULT_PRESENTATION);
  });

  it('survives a malformed reply rather than throwing mid-render', () => {
    expect(folded(RECORD, 'nonsense').template).toBe(DEFAULT_PRESENTATION.template);
    expect(folded(RECORD, 42).template).toBe(DEFAULT_PRESENTATION.template);
  });
});
