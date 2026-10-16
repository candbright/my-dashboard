// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { ResumeMarkdown } from '@/components/ResumeMarkdown';
import { resumeSanitizeSchema } from '@/lib/markdown-sanitize';
import type { Schema } from 'hast-util-sanitize';

/**
 * Tests for the single Markdown renderer (ticket 05, task 4).
 *
 * The security half matters most: resume text is user-controlled and rendered to
 * anonymous visitors on `/resume/[slug]`, so a sanitisation gap is a stored-XSS
 * path, not a cosmetic issue.
 *
 * The schema is exercised through the **real rehype pipeline** — `rehype-parse` →
 * `rehype-sanitize` → `rehype-stringify` — rather than against a hand-built HAST
 * tree. That distinction is not academic: an earlier revision of these tests built
 * trees directly, which passed while the shipping schema was silently deleting every
 * link. Testing the plugin the way it is actually invoked is what caught it.
 */

const pipeline = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, resumeSanitizeSchema)
  .use(rehypeStringify);

/** Sanitises an HTML fragment — the same path `rehype-raw` output takes. */
async function scrub(html: string): Promise<string> {
  return String(await pipeline.process(html));
}

describe('resumeSanitizeSchema — refuses the XSS payloads that matter', () => {
  it('removes script elements and their contents', async () => {
    const output = await scrub('<p>正文</p><script>alert(1)</script>');

    expect(output).toContain('正文');
    expect(output).not.toContain('script');
    expect(output).not.toContain('alert(1)');
  });

  it('removes the javascript: protocol from a link but keeps the link text', async () => {
    const output = await scrub('<a href="javascript:alert(1)">点我</a>');

    expect(output).toContain('点我');
    expect(output).not.toContain('javascript');
    expect(output).not.toContain('alert');
  });

  it('removes javascript: regardless of case or padding', async () => {
    // Protocol matching must not be defeated by `JaVaScRiPt:` or a leading control
    // character, both of which browsers tolerate.
    for (const payload of ['JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)']) {
      const output = await scrub(`<a href="${payload}">x</a>`);
      expect(output, payload).not.toMatch(/javascript/i);
    }
  });

  it('removes a data: URL from a link', async () => {
    const output = await scrub('<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>');

    expect(output).not.toContain('data:text/html');
    expect(output).not.toContain('base64');
  });

  it('removes a data: URL from an image', async () => {
    const output = await scrub('<img src="data:image/svg+xml,<svg onload=alert(1)>">');

    expect(output).not.toContain('data:image');
  });

  it('removes event-handler attributes', async () => {
    const output = await scrub(
      '<img src="https://example.com/a.png" onerror="alert(1)" onload="alert(2)">'
    );

    expect(output).not.toMatch(/onerror/i);
    expect(output).not.toMatch(/onload/i);
    expect(output).not.toContain('alert');
  });

  it('removes event handlers from every element, not just images', async () => {
    const output = await scrub(
      '<p onclick="alert(1)"><strong onmouseover="alert(2)">x</strong></p>'
    );

    expect(output).not.toMatch(/onclick|onmouseover/i);
  });

  it('removes iframe, object, embed, form, base, link and meta', async () => {
    for (const tag of ['iframe', 'object', 'embed', 'form', 'base', 'link', 'meta', 'style']) {
      const output = await scrub(`<${tag} src="https://evil.example"></${tag}>`);
      expect(output, `<${tag}> should not survive`).not.toContain(`<${tag}`);
    }
  });

  it('removes style attributes', async () => {
    // A `style` attribute would bypass the design system, which bans cool colours
    // and heavy shadows; its `url()` form is also an exfiltration vector.
    const output = await scrub('<p style="color: blue; background: url(https://evil.example)">x</p>');

    expect(output).not.toContain('blue');
    expect(output).not.toContain('evil.example');
  });

  it('removes svg, which carries its own scripting surface', async () => {
    const output = await scrub('<svg><script>alert(1)</script></svg>');

    expect(output).not.toContain('<svg');
    expect(output).not.toContain('script');
  });
});

describe('resumeSanitizeSchema — keeps what a resume needs', () => {
  it('keeps ordinary http and https links, including their href', async () => {
    // Regression guard: a schema syntax mistake once stripped every `href` silently,
    // so the public page rendered links as plain text with no error anywhere.
    const output = await scrub('<a href="https://example.com/cv" title="主页">我的主页</a>');

    expect(output).toContain('href="https://example.com/cv"');
    expect(output).toContain('title="主页"');
    expect(output).toContain('我的主页');
  });

  it('keeps mailto and tel links', async () => {
    expect(await scrub('<a href="mailto:a@b.c">mail</a>')).toContain('mailto:a@b.c');
    expect(await scrub('<a href="tel:+8613800138000">call</a>')).toContain('tel:+8613800138000');
  });

  it('keeps an image src from http or https', async () => {
    const output = await scrub('<img src="https://example.com/photo.png" alt="照片">');

    expect(output).toContain('src="https://example.com/photo.png"');
    expect(output).toContain('alt="照片"');
  });

  it('keeps bold, italic, lists, headings and del', async () => {
    for (const tag of ['strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'del']) {
      const output = await scrub(`<${tag}>内容</${tag}>`);
      expect(output, `<${tag}> should survive`).toContain(`<${tag}`);
    }
  });

  it('keeps table structure', async () => {
    // A bare `<th>` outside a `<table>` is dropped by the HTML *parser*, not the
    // sanitiser, so this has to be asserted on a complete table.
    const output = await scrub(
      '<table><thead><tr><th>项目</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table>'
    );

    for (const tag of ['table', 'thead', 'tbody', 'tr', 'th', 'td']) {
      expect(output, `<${tag}> should survive`).toContain(`<${tag}`);
    }
  });

  it('keeps code and pre, which a technical resume relies on', async () => {
    const output = await scrub('<pre><code>go build ./...</code></pre>');

    expect(output).toContain('<pre');
    expect(output).toContain('<code');
    expect(output).toContain('go build ./...');
  });

  it('keeps sup, sub and br for raw-HTML resumes', async () => {
    // The reason `rehype-raw` is kept at all: these are legitimate and useful.
    for (const tag of ['sup', 'sub', 'br']) {
      expect(await scrub(`<${tag}>`), `<${tag}> should survive`).toContain(`<${tag}`);
    }
  });

  it('keeps the highlight.js classes the highlighter adds', async () => {
    const output = await scrub('<code class="hljs language-go">func main()</code>');

    expect(output).toContain('hljs');
    expect(output).toContain('language-go');
  });

  it('keeps hljs- prefixed classes on spans inside a highlighted block', async () => {
    const output = await scrub('<span class="hljs-keyword">func</span>');

    expect(output).toContain('hljs-keyword');
  });

  it('strips a class that is not part of the highlighter vocabulary', async () => {
    // The allow-list is regex-scoped, so an unrelated class cannot ride along — which
    // matters because Tailwind classes are loaded by name and could be smuggled in.
    const output = await scrub('<code class="hljs evil-class bg-gradient-to-r">x</code>');

    expect(output).toContain('hljs');
    expect(output).not.toContain('evil-class');
    expect(output).not.toContain('bg-gradient-to-r');
  });

  it('keeps relative and fragment links', async () => {
    // In-page anchors and relative links are legitimate and must not be caught by the
    // protocol allow-list.
    expect(await scrub('<a href="/local/path">x</a>')).toContain('/local/path');
    expect(await scrub('<a href="#section">x</a>')).toContain('#section');
  });
});

describe('resumeSanitizeSchema — the schema shape itself is load-bearing', () => {
  /**
   * `hast-util-sanitize` reads `protocols` keyed by **attribute name**. A nested
   * `{ a: { href: [...] } }` — the shape its own documentation examples suggest for
   * other options — matches no attribute, so the entry is ignored *and* it replaces
   * the default protocol table with nothing, silently disabling `javascript:`
   * stripping. These tests exist so that refactor cannot reintroduce it.
   */
  it('declares protocols by attribute name, not by tag name', () => {
    const protocols = resumeSanitizeSchema.protocols as Record<string, unknown>;
    expect(Object.keys(protocols)).toContain('href');
    expect(Object.keys(protocols)).toContain('src');
    // A tag-keyed shape is the broken one.
    expect(protocols).not.toHaveProperty('a');
    expect(protocols).not.toHaveProperty('img');
  });

  it('blocks javascript: under the nested shape, proving the shape matters', async () => {
    // The counter-example, asserted rather than described: this is what the schema
    // must NOT look like. The cast is the point of the test — the tag-keyed shape is
    // what a plausible-looking refactor would produce, and it compiles fine.
    const broken = {
      ...resumeSanitizeSchema,
      protocols: { a: { href: ['http', 'https'] } },
    } as unknown as Schema;
    const brokenPipeline = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeSanitize, broken)
      .use(rehypeStringify);

    const leaked = String(await brokenPipeline.process('<a href="javascript:alert(1)">x</a>'));

    expect(leaked).toContain('javascript');
  });

  it('blocks vbscript: and file:', async () => {
    expect(await scrub('<a href="vbscript:msgbox(1)">x</a>')).not.toContain('vbscript');
    expect(await scrub('<a href="file:///etc/passwd">x</a>')).not.toContain('file:');
  });
});

describe('ResumeMarkdown — rendering', () => {
  it('renders bold as <strong>', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'**粗体**'}</ResumeMarkdown>);

    expect(html).toContain('<strong');
    expect(html).toContain('粗体');
    // The markers themselves must be consumed, not printed.
    expect(html).not.toContain('**');
  });

  it('renders a link as an anchor with its href', () => {
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'[我的主页](https://example.com)'}</ResumeMarkdown>
    );

    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('我的主页');
  });

  it('opens links in a new tab without leaking the referrer', () => {
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'[x](https://example.com)'}</ResumeMarkdown>
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders a list as <ul> with <li> items', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'- 第一条\n- 第二条'}</ResumeMarkdown>);

    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('第一条');
    expect(html).toContain('第二条');
  });

  it('renders a heading as a heading element', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'### 项目经历'}</ResumeMarkdown>);

    expect(html).toMatch(/<h[3-6]/);
    expect(html).toContain('项目经历');
  });

  it('renders inline code', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'用了 `PostgreSQL`'}</ResumeMarkdown>);

    expect(html).toContain('<code');
    expect(html).toContain('PostgreSQL');
  });

  it('renders a GFM table', () => {
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'| 项目 | 年份 |\n| --- | --- |\n| A | 2024 |'}</ResumeMarkdown>
    );

    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('2024');
  });

  it('renders a GFM strikethrough', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'~~旧版本~~'}</ResumeMarkdown>);

    expect(html).toContain('<del');
  });

  it('renders a blockquote', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'> 引用内容'}</ResumeMarkdown>);

    expect(html).toContain('<blockquote');
    expect(html).toContain('引用内容');
  });
});

describe('ResumeMarkdown — design tokens', () => {
  it('does not print Markdown markers literally', () => {
    // The original defect: `**粗体**` rendered as the literal characters.
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'**粗体** 与 [链接](https://e.com)'}</ResumeMarkdown>
    );

    expect(html).not.toContain('**粗体**');
    expect(html).not.toContain('](https://e.com)');
  });

  it('styles links with the primary token, never the default blue', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'[x](https://e.com)'}</ResumeMarkdown>);

    expect(html).toContain('text-primary');
    expect(html).not.toMatch(/text-blue|#0000ee|blue-/i);
  });

  it('styles bold with font-semibold and the foreground token', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'**x**'}</ResumeMarkdown>);

    expect(html).toContain('font-semibold');
    expect(html).toContain('text-foreground');
  });

  it('introduces no cool colours anywhere in the output', () => {
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'**b** [l](https://e.com)\n\n- i\n\n### h\n\n> q\n\n`c`'}</ResumeMarkdown>
    );

    for (const banned of ['blue', 'purple', 'cyan', 'indigo', 'violet', 'fuchsia', 'teal']) {
      expect(html, `${banned} must not appear`).not.toContain(banned);
    }
  });

  it('uses no shadow heavier than shadow-sm', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'**b**'}</ResumeMarkdown>);

    expect(html).not.toMatch(/shadow-(md|lg|xl|2xl)/);
  });

  it('uses no gradient background', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'**b**'}</ResumeMarkdown>);

    expect(html).not.toContain('bg-gradient-to');
  });
});

describe('ResumeMarkdown — inline mode', () => {
  it('does not wrap inline content in a block paragraph', () => {
    // An entry detail is a line inside a flex row; a block <p> there would break the
    // bullet's layout.
    const html = renderToStaticMarkup(<ResumeMarkdown inline>{'**提升了** 3 倍'}</ResumeMarkdown>);

    expect(html).not.toContain('<p');
    expect(html).toContain('<strong');
  });

  it('still renders emphasis inline', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown inline>{'用了 `Go`'}</ResumeMarkdown>);

    expect(html).toContain('<code');
  });
});

describe('ResumeMarkdown — empty and edge input', () => {
  it('renders nothing for an empty string', () => {
    expect(renderToStaticMarkup(<ResumeMarkdown>{''}</ResumeMarkdown>)).toBe('');
  });

  it('renders nothing for whitespace only', () => {
    expect(renderToStaticMarkup(<ResumeMarkdown>{'   \n  '}</ResumeMarkdown>)).toBe('');
  });

  it('keeps plain prose as prose', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'负责简历解析服务。'}</ResumeMarkdown>);

    expect(html).toContain('负责简历解析服务。');
  });

  it('neutralises a script tag in the source, end to end through React', () => {
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'正文\n\n<script>alert(1)</script>'}</ResumeMarkdown>
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('neutralises a javascript: link in the source, end to end through React', () => {
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'[点我](javascript:alert(1))'}</ResumeMarkdown>
    );

    expect(html).not.toContain('javascript:');
  });

  it('neutralises a raw HTML img with an onerror handler', () => {
    const html = renderToStaticMarkup(
      <ResumeMarkdown>{'<img src="x" onerror="alert(1)">'}</ResumeMarkdown>
    );

    expect(html).toContain('<img');
    expect(html).not.toMatch(/onerror/i);
  });

  it('keeps a legitimate raw HTML <br>', () => {
    const html = renderToStaticMarkup(<ResumeMarkdown>{'第一行<br>第二行'}</ResumeMarkdown>);

    expect(html).toContain('<br');
  });
});
