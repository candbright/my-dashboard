/**
 * Placeholder 个人信息 for the preview (ticket 48).
 *
 * The property that matters is not cosmetic: the fill is **preview-only**. The save path builds the
 * document from the raw form values, so the tests below pin both halves — what gets filled, and that
 * the caller's own record is left exactly as it was.
 */

import { describe, expect, it } from 'vitest';
import {
  PREVIEW_PLACEHOLDER_KEYS,
  previewMetadataValues,
} from '@/lib/resume-preview-metadata';
import { METADATA_FIELDS, metadataValuesFromRecord } from '@/lib/resume-metadata';
import { resumeMetadataView } from '@/lib/resume-parser';

/** What the create page starts a blank resume with: every field empty. */
const EMPTY = metadataValuesFromRecord({});

describe('previewMetadataValues', () => {
  it('fills the name and the contact fields, so the header has something to draw', () => {
    const filled = previewMetadataValues(EMPTY);

    expect(filled.name).toBe('张三');
    expect(filled.job_title).toBe('全栈开发工程师');
    expect(filled.email.length).toBeGreaterThan(0);
    expect(filled.phone.length).toBeGreaterThan(0);
    expect(filled.location).toBe('北京市');
  });

  it('leaves the link fields empty rather than putting fake URLs in the header', () => {
    // The contact line is plain text, so a placeholder link shows up as a URL and demonstrates
    // nothing about the template.
    const filled = previewMetadataValues(EMPTY);

    for (const field of METADATA_FIELDS.filter((spec) => spec.type === 'url')) {
      expect(filled[field.key], `${field.key} was filled with a URL`).toBe('');
      expect(PREVIEW_PLACEHOLDER_KEYS).not.toContain(field.key);
    }
  });

  it('never invents a value for a field the document does not contain', () => {
    // `summary` is the dashboard blurb, not resume content, so filling it would only be a value with
    // nowhere to go — and one more thing that looks like document metadata but is not.
    expect(PREVIEW_PLACEHOLDER_KEYS).not.toContain('summary');
    expect(previewMetadataValues(EMPTY).summary).toBe('');
  });

  it('keeps every value the user or a parse actually supplied', () => {
    const parsed = metadataValuesFromRecord({
      name: '李静',
      job_title: '数据分析师',
      email: 'lijing@example.com',
      phone: '13800138000',
      location: '上海',
    });

    const filled = previewMetadataValues(parsed);

    // The frontmatter of an uploaded file or an AI parse reaches the preview unchanged: placeholders
    // are a fallback, not an override.
    expect(filled).toEqual(parsed);
  });

  it('treats a whitespace-only value as blank, the same way the parser does', () => {
    const values = { ...EMPTY, name: '   ' };

    expect(previewMetadataValues(values).name).toBe('张三');
  });

  it('does not write to the record it was given', () => {
    // If it did, the placeholder would be saved as the resume's own name the next time the form was
    // read — which is the failure this whole module is arranged to avoid.
    const values = metadataValuesFromRecord({});
    const before = { ...values };

    previewMetadataValues(values);

    expect(values).toEqual(before);
  });

  it('produces a frontmatter view, which is how the renderers read it', () => {
    // The key mapping is `resumeMetadataView`'s job (`job_title` → `title`), and the preview must go
    // through it rather than assume the form's key names reach the renderer.
    const view = resumeMetadataView(previewMetadataValues(EMPTY));

    expect(view.name).toBe('张三');
    expect(view.title).toBe('全栈开发工程师');
    expect(view.email).toBe('name@example.com');
  });
});
