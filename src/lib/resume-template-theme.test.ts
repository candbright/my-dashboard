/**
 * Theme and contact-resolution tests (ticket 20).
 *
 * These cover the two pure modules the renderers are built on. They are separate from the renderer
 * tests because the interesting behaviour here is arithmetic and precedence, which is much easier to
 * get wrong than to see: a `serif` font stack that resolves to nothing and a photo flag that is
 * silently ignored both look fine in a screenshot.
 */

import { describe, expect, it } from 'vitest';
import {
  BASE_FONT_SIZE_PX,
  SIZE_SCALES,
  buildTheme,
  contentBoxFor,
  scaledSize,
} from '@/lib/resume-template-theme';
import { DEFAULT_PRESENTATION, type ResumePresentation } from '@/lib/resume-presentation';
import { contactEntries, displayName, formatContactValue, resolvePhoto } from '@/components/resume-render/contact';

/** A presentation with overrides, kept valid so the test is about the theme and not about validation. */
function presentation(overrides: Partial<ResumePresentation> = {}): ResumePresentation {
  return { ...DEFAULT_PRESENTATION, ...overrides };
}

describe('buildTheme (ticket 20)', () => {
  it('turns the font token into a real stack, not a family name', () => {
    // The print document is a self-contained iframe with no Tailwind and no CSS variables, so a bare
    // `serif` would be the only thing the browser sees and it would pick Times New Roman.
    const theme = buildTheme(presentation({ fontFamily: 'serif' }));
    expect(theme.fontFamily).toContain('Georgia');
    expect(theme.fontFamily).toContain('serif');
  });

  it('never emits a var() reference', () => {
    // This is the defect the module exists to close: the old print view used
    // `var(--font-serif, "Noto Serif SC", …)` and the iframe has no `--font-serif`, so the PDF always
    // used the fallback. It worked by luck and would have broken silently if the fallback changed.
    for (const family of ['serif', 'sans'] as const) {
      expect(buildTheme(presentation({ fontFamily: family })).fontFamily).not.toContain('var(');
    }
  });

  it('uses a different stack per family', () => {
    const serif = buildTheme(presentation({ fontFamily: 'serif' }));
    const sans = buildTheme(presentation({ fontFamily: 'sans' }));
    expect(serif.fontFamily).not.toBe(sans.fontFamily);
  });

  it('scales the base size by fontScale', () => {
    expect(buildTheme(presentation({ fontScale: 1 })).baseFontSize).toBe('14px');
    expect(buildTheme(presentation({ fontScale: 1.5 })).baseFontSize).toBe('21px');
    expect(buildTheme(presentation({ fontScale: 0.8 })).baseFontSize).toBe('11.2px');
  });

  it('rounds a scaled size to two decimals', () => {
    // 14 * 1.15 = 16.099999999999998. Valid CSS, but it makes the rendered markup untestable by
    // string comparison and unreadable in a diff.
    expect(buildTheme(presentation({ fontScale: 1.15 })).baseFontSize).toBe('16.1px');
  });

  it('carries the accent through as a literal hex', () => {
    expect(buildTheme(presentation({ accentColor: '#8b9d77' })).accentColor).toBe('#8b9d77');
  });

  it('carries lineHeight through as a unitless multiplier', () => {
    // CSS treats a bare number as a multiplier of the element's own size; `1.5px` would be a fixed
    // 1.5-pixel line box, which is a very different (and broken) document.
    expect(buildTheme(presentation({ lineHeight: 1.5 })).lineHeight).toBe('1.5');
  });

  it('converts the page margin to pixels for the on-screen preview', () => {
    // 18mm at 96dpi = 68.03px. Derived from the same millimetre value as the @page rule so the
    // preview inset and the printed margin cannot drift.
    expect(buildTheme(presentation({ pageMargin: '18mm' })).pageMarginPx).toBe('68.03px');
    expect(buildTheme(presentation({ pageMargin: '30mm' })).pageMarginPx).toBe('113.39px');
  });

  it('accepts every unit the server accepts', () => {
    const mm = buildTheme(presentation({ pageMargin: '18mm' })).pageMarginPx;
    // 1.8cm, 18mm and 0.708661in are the same length; pt differs because 1pt is 1/72in.
    expect(buildTheme(presentation({ pageMargin: '1.8cm' })).pageMarginPx).toBe(mm);
    expect(buildTheme(presentation({ pageMargin: '0.708661in' })).pageMarginPx).toBe(mm);
    expect(buildTheme(presentation({ pageMargin: '51.02pt' })).pageMarginPx).toBe(mm);
  });

  it('falls back rather than producing NaN when the margin cannot be parsed', () => {
    // The bound is enforced upstream, so this is a second line of defence — but a NaN here would push
    // every block off the page, and a broken PDF is worse than a default margin.
    const theme = buildTheme(presentation({ pageMargin: 'nonsense' }));
    expect(theme.pageMargin).toBe('18mm');
    expect(theme.pageMarginPx).toBe('68.03px');
  });

  it('rejects a zero margin on the render path even though the server already would', () => {
    // A resume printed to the paper edge gets clipped by most printers.
    expect(buildTheme(presentation({ pageMargin: '0mm' })).pageMargin).toBe('18mm');
  });

  it('computes the printable box from the margin', () => {
    // A4 is 210x297mm; at an 18mm margin the box is 174x261mm = 657.64x986.46px, floored.
    expect(buildTheme(presentation({ pageMargin: '18mm' })).contentBox).toEqual({
      width: 657,
      height: 986,
    });
  });

  it('gives a wider margin a smaller box', () => {
    const narrow = buildTheme(presentation({ pageMargin: '10mm' })).contentBox;
    const wide = buildTheme(presentation({ pageMargin: '40mm' })).contentBox;
    expect(narrow.width).toBeGreaterThan(wide.width);
    expect(narrow.height).toBeGreaterThan(wide.height);
  });
});

describe('contentBoxFor and scaledSize (ticket 20)', () => {
  it('keeps the box inside A4 for every legal margin', () => {
    for (const mm of [5, 18, 30, 60]) {
      const box = contentBoxFor(mm);
      expect(box.width).toBeGreaterThan(0);
      expect(box.width).toBeLessThanOrEqual(794);
      expect(box.height).toBeLessThanOrEqual(1123);
    }
  });

  it('reproduces the pre-refactor sizes at fontScale 1', () => {
    // The refactor must not resize anything for an existing user. These are the values
    // ResumePrintView hard-coded, and DEFAULT_PRESENTATION has fontScale 1.
    const theme = buildTheme(presentation({ fontScale: 1 }));
    expect(scaledSize(theme, SIZE_SCALES.name)).toBe('32px');
    expect(scaledSize(theme, SIZE_SCALES.title)).toBe('16px');
    expect(scaledSize(theme, SIZE_SCALES.section)).toBe('18px');
    expect(scaledSize(theme, SIZE_SCALES.entry)).toBe('15px');
    expect(scaledSize(theme, SIZE_SCALES.body)).toBe('14px');
    expect(scaledSize(theme, SIZE_SCALES.small)).toBe('13px');
    expect(BASE_FONT_SIZE_PX).toBe(14);
  });

  it('scales every size together', () => {
    const theme = buildTheme(presentation({ fontScale: 2 }));
    expect(scaledSize(theme, SIZE_SCALES.name)).toBe('64px');
    expect(scaledSize(theme, SIZE_SCALES.body)).toBe('28px');
  });
});

describe('contactEntries (ticket 20)', () => {
  it('omits absent fields rather than rendering gaps', () => {
    expect(contactEntries({ name: '李明' })).toEqual([]);
  });

  it('treats an empty string as absent', () => {
    expect(contactEntries({ email: '', phone: '' })).toEqual([]);
  });

  it('treats whitespace as absent', () => {
    // The extractor strips whitespace, but a hand-edited record can still hold it, and a chip
    // containing one space looks like a rendering bug.
    expect(contactEntries({ email: '   ' })).toEqual([]);
  });

  it('orders contacts for a reader, not for a form', () => {
    // `ResumeMetadataView` is the header's view of the metadata: `name`, `title` and the six
    // contacts. `summary`, `avatar` and `job_title` either belong elsewhere or are not contact
    // details, which is what the second assertion below pins.
    const entries = contactEntries({
      name: '李明',
      title: '工程师',
      email: 'a@b.com',
      phone: '123',
      location: '上海',
      website: 'https://c.dev',
      github: 'https://github.com/u',
      linkedin: 'https://linkedin.com/in/u',
      avatar: 'https://x/y.jpg',
    });
    expect(entries.map((e) => e.label)).toEqual([
      'Email',
      'Phone',
      'Location',
      'Website',
      'GitHub',
      'LinkedIn',
    ]);
    // `name` and `avatar` are not contact details and must not appear as chips.
    expect(entries.map((e) => e.label)).not.toContain('Name');
    expect(entries.map((e) => e.label)).not.toContain('Avatar');
  });

  it('builds mailto and tel links, and no link for a location', () => {
    const entries = contactEntries({ email: 'a@b.com', phone: '123', location: '上海' });
    expect(entries[0]?.href).toBe('mailto:a@b.com');
    expect(entries[1]?.href).toBe('tel:123');
    expect(entries[2]?.href).toBeNull();
  });

  it('stores an absolute href even when the display form is shortened', () => {
    // The display is `liming`, but the link must still work — this is why `ContactEntry` carries both.
    const [entry] = contactEntries({ github: 'https://github.com/liming' });
    expect(entry?.value).toBe('https://github.com/liming');
    expect(entry?.display).toBe('liming');
    expect(entry?.href).toBe('https://github.com/liming');
  });

  describe('formatContactValue', () => {
    it('shortens a profile URL to its handle', () => {
      expect(formatContactValue('https://github.com/liming', 'GitHub')).toBe('liming');
      expect(formatContactValue('https://linkedin.com/in/liming', 'LinkedIn')).toBe('in/liming');
    });

    it('strips a trailing slash', () => {
      expect(formatContactValue('https://github.com/liming/', 'GitHub')).toBe('liming');
    });

    it('shortens a website to its hostname', () => {
      expect(formatContactValue('https://liming.dev/about/me', 'Website')).toBe('liming.dev');
    });

    it('leaves a value that is not a URL alone', () => {
      // People type `github.com/liming`, `@liming` and a bare number into these fields. Discarding
      // what they typed to satisfy a formatter would be worse than showing it unshortened.
      expect(formatContactValue('github.com/liming', 'GitHub')).toBe('github.com/liming');
      expect(formatContactValue('@liming', 'GitHub')).toBe('@liming');
      expect(formatContactValue('上海市', 'Location')).toBe('上海市');
    });

    it('does not mangle an email or a phone number', () => {
      expect(formatContactValue('a@b.com', 'Email')).toBe('a@b.com');
      expect(formatContactValue('+86 139-0000-0000', 'Phone')).toBe('+86 139-0000-0000');
    });
  });
});

describe('resolvePhoto (ticket 20)', () => {
  const withAvatar = { avatar: 'https://example.com/avatar.jpg' };

  it('returns nothing when the presentation does not enable a photo', () => {
    // The flag existed since ticket 19 and no component read it, which made it decorative. This is
    // the assertion that makes it real.
    expect(resolvePhoto(withAvatar, presentation({ photo: { enabled: false, path: null } }))).toBeNull();
  });

  it('refuses a photo even when a path is set, if the flag is off', () => {
    const p = presentation({ photo: { enabled: false, path: 'https://example.com/me.jpg' } });
    expect(resolvePhoto(withAvatar, p)).toBeNull();
  });

  it('prefers the presentation\u2019s own photo', () => {
    const p = presentation({ photo: { enabled: true, path: 'https://example.com/me.jpg' } });
    expect(resolvePhoto(withAvatar, p)).toBe('https://example.com/me.jpg');
  });

  it('falls back to the metadata avatar rather than rendering a hole', () => {
    // "Enabled but no photo chosen yet" is a state the style panel can produce.
    const p = presentation({ photo: { enabled: true, path: null } });
    expect(resolvePhoto(withAvatar, p)).toBe('https://example.com/avatar.jpg');
  });

  it('returns nothing when enabled with neither source', () => {
    const p = presentation({ photo: { enabled: true, path: null } });
    expect(resolvePhoto({}, p)).toBeNull();
  });
});

describe('displayName (ticket 20)', () => {
  it('prefers the metadata name', () => {
    expect(displayName({ name: '李明' }, '我的简历')).toBe('李明');
  });

  it('falls back to the resume title', () => {
    // A resume saved before metadata existed has no name in its frontmatter; a blank header would
    // look broken rather than empty.
    expect(displayName({}, '我的简历')).toBe('我的简历');
  });

  it('treats an empty name as absent', () => {
    expect(displayName({ name: '' }, '我的简历')).toBe('我的简历');
  });
});
