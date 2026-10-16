/**
 * The accessibility of the form atoms' error state.
 *
 * # The defect this pins
 *
 * `Input`, `Textarea` and `Select` all rendered their error message as a bare `<p>` next to the
 * field, and never set `aria-invalid` on the control itself. Neither `aria-invalid` nor
 * `aria-describedby` appeared anywhere in the repository.
 *
 * The result was that an error was communicated by **colour alone** — a red border and red text —
 * which a screen reader user never receives: the field is announced as ordinary and the message is
 * orphaned text sitting elsewhere in the form. A user who cannot perceive the red is not told the
 * field is wrong and therefore cannot fix it. That is WCAG 2.2 **3.3.1 Error Identification** (A)
 * and **1.3.1 Info and Relationships** (A); "colour alone" itself is **1.4.1** (A).
 *
 * # Why it is tested at the atom level
 *
 * Every form in the app is built from these three components, so asserting the contract here covers
 * every call site at once. A per-page test would have to be repeated for each new form and would be
 * forgotten — which is exactly how the gap arose in the first place.
 *
 * `role="alert"` is asserted alongside `aria-describedby`: the description is what the field reads
 * out when focused, and the live region is what announces the problem at the moment it appears,
 * without the user having to navigate back to the field to discover it.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';

/** Pulls a single attribute value out of rendered HTML, for the id-linkage assertions. */
function attr(html: string, name: string): string | undefined {
  const match = html.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

describe('表单原子的错误状态可被辅助技术感知', () => {
  it('Input: marks the field invalid and associates the message', () => {
    const html = renderToStaticMarkup(
      createElement(Input, { label: '邮箱', errorMessage: '邮箱格式不正确', id: 'email' })
    );

    expect(attr(html, 'aria-invalid')).toBe('true');
    // The message must be the thing described, and must exist under that id.
    expect(attr(html, 'aria-describedby')).toBe('email-error');
    expect(html).toContain('id="email-error"');
    expect(html).toContain('role="alert"');
  });

  it('Input: associates the description when there is no error', () => {
    const html = renderToStaticMarkup(
      createElement(Input, { label: '邮箱', description: '用于接收通知', id: 'email' })
    );

    expect(attr(html, 'aria-describedby')).toBe('email-description');
    expect(html).toContain('id="email-description"');
    // No error, so the field must not claim to be invalid.
    expect(html).not.toContain('aria-invalid');
  });

  it('Input: a valid field claims nothing', () => {
    // The negative case. `aria-invalid` on a correct field is worse than absent: it tells the user
    // something is wrong when nothing is.
    const html = renderToStaticMarkup(createElement(Input, { label: '邮箱', id: 'email' }));

    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('aria-describedby');
  });

  it('Textarea: marks the field invalid and associates the message', () => {
    const html = renderToStaticMarkup(
      createElement(Textarea, { label: '简介', errorMessage: '太长了', id: 'bio' })
    );

    expect(attr(html, 'aria-invalid')).toBe('true');
    expect(attr(html, 'aria-describedby')).toBe('bio-error');
    expect(html).toContain('id="bio-error"');
    expect(html).toContain('role="alert"');
  });

  it('Select: marks the field invalid and associates the message', () => {
    const html = renderToStaticMarkup(
      createElement(Select, {
        label: '城市',
        errorMessage: '请选择城市',
        id: 'city',
        options: [{ value: 'bj', label: '北京' }],
      })
    );

    expect(attr(html, 'aria-invalid')).toBe('true');
    expect(attr(html, 'aria-describedby')).toBe('city-error');
    expect(html).toContain('id="city-error"');
    expect(html).toContain('role="alert"');
  });

  it('generates a matching id when the caller does not supply one', () => {
    // The linkage has to work for the common case too, where no `id` is passed. The describedby
    // target is derived from the generated id, so this checks the two still agree.
    const html = renderToStaticMarkup(
      createElement(Input, { label: '邮箱', errorMessage: '错了' })
    );

    const describedBy = attr(html, 'aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
  });
});
