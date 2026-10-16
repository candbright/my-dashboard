import { describe, it, expect } from 'vitest';
import {
  METADATA_FIELDS,
  METADATA_KEYS,
  METADATA_MAX_LENGTH,
  collectMetadataErrors,
  invalidMetadataUrlNotice,
  isAcceptableMetadataUrl,
  isMetadataPatchEmpty,
  metadataLabel,
  metadataPatchFromDiff,
  metadataValuesFromRecord,
  metadataValuesFromView,
  metadataValuesWithoutInvalidUrls,
  validateMetadataField,
  validateMetadataValues,
  type MetadataKey,
  type ResumeMetadataValues,
} from './resume-metadata';

// Tier: unit. Pure logic — no DOM, no network.

describe('METADATA_FIELDS', () => {
  it('uses the server column names, not the frontmatter keys', () => {
    // The one mapping that used to be reconciled by hand at every call site. The column is
    // `job_title`; `title` is the *frontmatter* key and does not exist server-side, so
    // sending `title` would be rejected as an unknown field.
    expect(METADATA_KEYS).toContain('job_title');
    expect(METADATA_KEYS).not.toContain('title');
  });

  it('declares every key the server accepts, in the server order', () => {
    // Order is load-bearing: it is the form layout and the order errors are reported in, and
    // the server validates in the same order so the message matches the topmost bad input.
    expect([...METADATA_KEYS]).toEqual([
      'name',
      'job_title',
      'email',
      'phone',
      'location',
      'website',
      'github',
      'linkedin',
      'avatar',
      'summary',
    ]);
  });

  it('gives every field a label and a placeholder', () => {
    for (const field of METADATA_FIELDS) {
      expect(field.label, field.key).toBeTruthy();
      expect(field.placeholder, field.key).toBeTruthy();
    }
  });

  it('has no duplicate keys', () => {
    expect(new Set(METADATA_KEYS).size).toBe(METADATA_KEYS.length);
  });

  it('marks avatar as a link, since it is rendered as an image source', () => {
    expect(METADATA_FIELDS.find((f) => f.key === 'avatar')?.type).toBe('url');
  });
});

describe('metadataLabel', () => {
  it('returns the Chinese label for a field', () => {
    expect(metadataLabel('job_title')).toBe('职位');
    expect(metadataLabel('email')).toBe('邮箱');
  });

  it('falls back to the key rather than throwing on an unknown field', () => {
    // An error message naming `job_title` is poor; a blank or a crash is worse.
    expect(metadataLabel('nope' as MetadataKey)).toBe('nope');
  });
});

describe('validateMetadataField — accepts', () => {
  const accepted: Array<[MetadataKey, string]> = [
    ['name', '张三'],
    ['name', '张: 三 # 备注'],
    ['job_title', '高级工程师: 后端'],
    ['phone', '+86 138-0000-0000'],
    ['phone', '(010) 1234-5678'],
    ['location', '北京市朝阳区'],
    ['summary', '5 年后端经验。'],
    // Practice-relevant addresses a strict RFC pattern would reject.
    ['email', 'zhang+resume@example.com'],
    ['email', 'zhang.san@mail.example.co.uk'],
    ['email', 'zhang_san@my-company.com'],
    ['email', 'ZhangSan@Example.COM'],
    // Scheme-less links, which is what people actually type.
    ['website', 'example.com'],
    ['website', 'example.com/about'],
    ['website', 'example.com:8080'],
    ['website', 'http://example.com'],
    ['website', 'HTTPS://EXAMPLE.COM'],
    ['website', 'https://example.com/p?q=1#x'],
    ['github', 'https://github.com/username'],
    ['linkedin', 'https://www.linkedin.com/in/username'],
    ['avatar', 'https://example.com/a.png'],
  ];

  it.each(accepted)('%s accepts %j', (key, value) => {
    expect(validateMetadataField(key, value)).toBeNull();
  });

  it('accepts an empty value as a clear, for every field', () => {
    // Clearing is a normal edit. Validating it would make "delete my email" impossible.
    for (const key of METADATA_KEYS) {
      expect(validateMetadataField(key, ''), key).toBeNull();
    }
  });

  it('treats whitespace-only as empty', () => {
    // Select-all then delete commonly leaves a space behind.
    for (const key of METADATA_KEYS) {
      expect(validateMetadataField(key, '   '), key).toBeNull();
    }
  });

  it('accepts surrounding whitespace on a valid address', () => {
    expect(validateMetadataField('email', '  a@b.com  ')).toBeNull();
  });
});

describe('validateMetadataField — rejects', () => {
  const rejected: Array<[MetadataKey, string, string]> = [
    ['email', 'zhangsan.example.com', '邮箱格式不正确'],
    ['email', 'a@b@example.com', '邮箱格式不正确'],
    ['email', 'zhangsan@example', '邮箱格式不正确'],
    ['email', 'zhangsan@example.', '邮箱格式不正确'],
    ['email', '@example.com', '邮箱格式不正确'],
    ['email', 'a b@example.com', '邮箱格式不正确'],
    // A scheme that executes. These become `href`s and appear inside the exported PDF.
    ['website', 'javascript:alert(1)', '链接格式不正确'],
    ['website', 'javascript://alert(1)', '链接格式不正确'],
    ['website', 'data:text/html;base64,PHNjcmlwdD4=', '链接格式不正确'],
    ['website', 'vbscript:msgbox(1)', '链接格式不正确'],
    ['website', 'file:///etc/passwd', '链接格式不正确'],
    ['github', 'ftp://example.com/x', '链接格式不正确'],
    ['website', 'notaurl', '链接格式不正确'],
    ['website', 'my website', '链接格式不正确'],
    ['website', 'https://', '链接格式不正确'],
    ['website', 'http://localhost:3000', '链接格式不正确'],
  ];

  it.each(rejected)('%s rejects %j', (key, value, fragment) => {
    const message = validateMetadataField(key, value);
    expect(message, `${key}=${value} should be rejected`).not.toBeNull();
    expect(message).toContain(fragment);
  });

  it('rejects a name over 100 characters', () => {
    expect(validateMetadataField('name', '经'.repeat(101))).toContain('姓名过长');
  });

  it('rejects a summary over 2000 characters', () => {
    expect(validateMetadataField('summary', '经'.repeat(2001))).toContain('个人简介过长');
  });

  it('rejects an email over 254 characters', () => {
    expect(validateMetadataField('email', `${'a'.repeat(250)}@example.com`)).toContain('邮箱过长');
  });
});

describe('length limits count characters, not UTF-16 units', () => {
  it('accepts exactly 100 Chinese characters', () => {
    // `String.length` would count these as 100 too, so this case passes either way.
    expect(validateMetadataField('name', '经'.repeat(100))).toBeNull();
  });

  it('counts an astral-plane character as one, matching the server', () => {
    // `String.length` reports 2 for '𠮷' (a surrogate pair), so a `.length`-based check
    // would reject at 50 characters while the server's rune count allows 100 — the client
    // and server would disagree about the same value.
    const astral = '𠮷';
    expect(astral.length).toBe(2);
    expect(validateMetadataField('name', astral.repeat(100))).toBeNull();
    expect(validateMetadataField('name', astral.repeat(101))).toContain('姓名过长');
  });

  it('every length-limited field states its own limit in the message', () => {
    for (const key of METADATA_KEYS) {
      const max = METADATA_MAX_LENGTH[key];
      if (max === undefined) continue;
      const message = validateMetadataField(key, 'a'.repeat(max + 1));
      expect(message, key).not.toBeNull();
    }
  });
});

describe('validateMetadataValues', () => {
  it('returns null for a valid form', () => {
    expect(
      validateMetadataValues({
        name: '张三',
        email: 'a@b.com',
        website: 'https://example.com',
      })
    ).toBeNull();
  });

  it('returns null for an empty form', () => {
    expect(validateMetadataValues({})).toBeNull();
  });

  it('reports the topmost field in presentation order', () => {
    // The user fixes the first error they see; reporting one lower down makes them hunt.
    const problem = validateMetadataValues({
      summary: 'x'.repeat(3000), // last
      email: 'not-an-email', // third
      name: 'x'.repeat(101), // first
    });
    expect(problem?.key).toBe('name');
  });

  it('skips fields that are absent, rather than treating them as invalid', () => {
    expect(validateMetadataValues({ name: undefined })).toBeNull();
  });
});

describe('collectMetadataErrors', () => {
  it('marks every offending field at once', () => {
    const errors = collectMetadataErrors({
      email: 'bad',
      website: 'also bad',
      name: '张三',
    });
    expect(Object.keys(errors).sort()).toEqual(['email', 'website']);
    expect(errors.name).toBeUndefined();
  });

  it('returns an empty object for a clean form', () => {
    expect(collectMetadataErrors({ name: '张三', email: 'a@b.com' })).toEqual({});
  });
});

describe('isAcceptableMetadataUrl', () => {
  it('is the same rule the field validator uses', () => {
    // Pinned so the exported predicate cannot drift from `validateMetadataField`, which is
    // what the component actually calls.
    for (const value of ['example.com', 'https://a.b', 'notaurl', 'javascript:x']) {
      const viaField = validateMetadataField('website', value) === null;
      expect(isAcceptableMetadataUrl(value), value).toBe(viaField);
    }
  });
});

describe('metadataValuesWithoutInvalidUrls', () => {
  /** A clean form with `overrides` applied, which is what a parse hands over. */
  function values(overrides: Partial<Record<MetadataKey, string>> = {}): ResumeMetadataValues {
    return { ...metadataValuesFromRecord({}), ...overrides };
  }

  it('drops the relative media path an AI parse supplies as an avatar', () => {
    // The reported defect: the model echoes `images/X13.png` out of the source document's own
    // folder. It is not a URL, and keeping it blocked 保存到平台 over a field the user never typed.
    const { values: kept, dropped } = metadataValuesWithoutInvalidUrls(
      values({ name: '张三', avatar: 'images/X13.png' })
    );

    expect(kept.avatar).toBe('');
    expect(kept.name).toBe('张三');
    expect(dropped).toEqual([{ key: 'avatar', value: 'images/X13.png' }]);
  });

  it('drops nothing a clean parse supplied, links included', () => {
    const { values: kept, dropped } = metadataValuesWithoutInvalidUrls(
      values({
        website: 'https://example.com',
        github: 'github.com/octocat',
        linkedin: 'https://linkedin.com/in/x',
        avatar: 'https://example.com/a.png',
      })
    );

    expect(dropped).toEqual([]);
    expect(kept.github).toBe('github.com/octocat');
  });

  it('trims nothing else, and leaves text fields entirely alone', () => {
    // Only links are this function's business. A summary or a name is the document's own content.
    const { values: kept } = metadataValuesWithoutInvalidUrls(
      values({ summary: 'x'.repeat(2500), name: ' 张三 ', avatar: 'images/a.png' })
    );

    expect(kept.summary).toHaveLength(2500);
    expect(kept.name).toBe(' 张三 ');
  });

  it('keeps the field out of the form so the whole-form check passes', () => {
    // The property that matters to the user: what a parse seeds can always be saved.
    const { values: kept } = metadataValuesWithoutInvalidUrls(
      values({ avatar: 'images/X13.png', website: '/about.html' })
    );

    expect(collectMetadataErrors(kept)).toEqual({});
  });

  it('refuses a scheme that executes, not just a relative path', () => {
    // `javascript:` in an `href` is a hazard rather than a formatting nit, and a parsed file is
    // exactly the untrusted route such a value arrives by.
    const { values: kept, dropped } = metadataValuesWithoutInvalidUrls(
      values({ website: 'javascript:alert(1)', avatar: 'data:text/html;base64,PHNjcmlwdD4=' })
    );

    expect(kept.website).toBe('');
    expect(kept.avatar).toBe('');
    expect(dropped.map((d) => d.key)).toEqual(['website', 'avatar']);
  });

  it('treats a whitespace-only link as absent, not as a problem to report', () => {
    const { values: kept, dropped } = metadataValuesWithoutInvalidUrls(values({ avatar: '   ' }));

    expect(kept.avatar.trim()).toBe('');
    expect(dropped).toEqual([]);
  });
});

describe('invalidMetadataUrlNotice', () => {
  it('says nothing when nothing was dropped', () => {
    expect(invalidMetadataUrlNotice([])).toBeNull();
  });

  it('names the field and quotes the value it ignored', () => {
    // Both halves are needed: 「已忽略」 alone is a change the user cannot account for.
    const notice = invalidMetadataUrlNotice([{ key: 'avatar', value: 'images/X13.png' }]);

    expect(notice).toContain('头像链接');
    expect(notice).toContain('images/X13.png');
    expect(notice).toContain('https://');
  });

  it('lists every dropped field, so none goes unmentioned', () => {
    const notice = invalidMetadataUrlNotice([
      { key: 'avatar', value: 'images/X13.png' },
      { key: 'website', value: './about.html' },
    ]);

    expect(notice).toContain('头像链接');
    expect(notice).toContain('网站');
    expect(notice).toContain('images/X13.png');
    expect(notice).toContain('./about.html');
  });
});

describe('metadataValuesFromRecord', () => {
  it('turns null columns into empty strings', () => {
    // The form has one representation of "no value", so inputs need no `?? ''` guard.
    const values = metadataValuesFromRecord({
      name: '张三',
      email: null,
      phone: undefined,
    });
    expect(values.name).toBe('张三');
    expect(values.email).toBe('');
    expect(values.phone).toBe('');
  });

  it('always returns a value for every key', () => {
    const values = metadataValuesFromRecord({});
    for (const key of METADATA_KEYS) {
      expect(values[key], key).toBe('');
    }
  });
});

describe('metadataValuesFromView', () => {
  it('maps the frontmatter job title onto the form column', () => {
    // The create flow seeds the form from an imported document. If this used `title`
    // as the form key, the 职位 input would stay empty while the preview showed it.
    const values = metadataValuesFromView({
      name: '李四',
      title: '后端工程师',
      email: 'lisi@example.com',
    });
    expect(values.name).toBe('李四');
    expect(values.job_title).toBe('后端工程师');
    expect(values.email).toBe('lisi@example.com');
    expect(values.phone).toBe('');
    expect(values.summary).toBe('');
  });

  it('accepts a dashboard summary that the view does not carry', () => {
    const values = metadataValuesFromView({ name: '李四' }, { summary: '一句话' });
    expect(values.summary).toBe('一句话');
  });
});

describe('metadataPatchFromDiff', () => {
  it('includes only changed fields', () => {
    const patch = metadataPatchFromDiff(
      { name: '张三', email: 'old@example.com', phone: '138' },
      { name: '张三', email: 'new@example.com', phone: '138' }
    );
    expect(patch).toEqual({ email: 'new@example.com' });
  });

  it('represents a cleared field as an empty string, not an omission', () => {
    // The distinction the server relies on: `''` clears, absent leaves alone. Sending an
    // omission here would make "delete my phone number" a no-op.
    const patch = metadataPatchFromDiff({ phone: '138' }, { phone: '' });
    expect(patch).toEqual({ phone: '' });
    expect('phone' in patch).toBe(true);
  });

  it('omits a field whose value did not change, even when both are empty', () => {
    const patch = metadataPatchFromDiff(
      { phone: '', email: 'a@b.com' },
      { phone: '', email: 'a@b.com' }
    );
    expect(isMetadataPatchEmpty(patch)).toBe(true);
  });

  it('treats a missing original as empty', () => {
    // A resume whose columns are still NULL: typing a name must produce a patch.
    const patch = metadataPatchFromDiff({}, { name: '张三' });
    expect(patch).toEqual({ name: '张三' });
  });

  it('skips a changed field the edited form does not carry', () => {
    // `undefined` in the edited values means "the form has no opinion", not "clear it" —
    // which is why `metadataValuesFromRecord` always fills every key.
    const patch = metadataPatchFromDiff({ name: '张三' }, {});
    expect(isMetadataPatchEmpty(patch)).toBe(true);
  });

  it('produces an empty patch when nothing changed', () => {
    const values = { name: '张三', email: 'a@b.com' };
    expect(isMetadataPatchEmpty(metadataPatchFromDiff(values, values))).toBe(true);
  });

  it('survives JSON serialisation with its distinctions intact', () => {
    // This is the property that makes the contract work over the wire: `undefined` must
    // vanish and `''` must survive. If both serialised the same way, the server would
    // either clear everything or clear nothing.
    const patch = metadataPatchFromDiff(
      { name: '张三', phone: '138', email: 'a@b.com' },
      { name: '张三', phone: '', email: 'new@b.com' }
    );
    const json = JSON.parse(JSON.stringify(patch));
    expect(json).toEqual({ phone: '', email: 'new@b.com' });
    expect('name' in json).toBe(false);
    expect('phone' in json).toBe(true);
  });
});

describe('isMetadataPatchEmpty', () => {
  it('is true only for an empty patch', () => {
    expect(isMetadataPatchEmpty({})).toBe(true);
    expect(isMetadataPatchEmpty({ phone: '' })).toBe(false);
    expect(isMetadataPatchEmpty({ name: 'x' })).toBe(false);
  });
});
