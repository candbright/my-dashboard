/**
 * The creation wizard, driven through the component that owns it (ticket 48).
 *
 * # Two things are covered here, and the split matters
 *
 * **The AI parse's wiring.** `ResumeBuilderPage.handleStartAI` held *all* of the parse's state to itself and
 * passed none of it to the screen that starts the parse:
 *
 * - no loading flag, so the button stayed enabled and unchanged for the tens of seconds a parse takes;
 * - `error` was rendered only in the editor — the one view a *failed* parse never reaches. Every failure
 *   therefore rendered as **absolutely nothing**, which is why it was reported as "the UI doesn't respond";
 * - the wall-clock timeout was cleared as soon as the response's headers arrived, so it bounded connecting
 *   only. A provider that stopped mid-answer left the screen waiting forever;
 * - an in-band `{"error": …}` frame was dropped, because the SSE reader was called without `onError` — so a
 *   mid-stream failure was stored as a short but successful answer.
 *
 * `ResumeStartScreen.test.tsx` covers what the screen *renders* for a given state; these cases cover the
 * wiring, because ticket 44's lesson was that pinning a decision function while leaving the call site
 * unasserted lets the two drift.
 *
 * **The three-phase flow itself.** The ticket's claim is that a template changes the *style* and nothing
 * else. That claim is a property of the phase machine — style → content → editor, with back-navigation that
 * preserves everything — so it is asserted here, at the level that owns the machine, rather than in either
 * step's own test.
 */
// @vitest-environment happy-dom

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'framer-motion';
import { DEFAULT_PRESENTATION } from '@/lib/resume-presentation';
import { RESUME_SEEDS } from '@/lib/resume-template-seeds';
import { TEMPLATE_METADATA } from '@/lib/resume-template';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const apiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const { ResumeBuilderPage } = await import('@/components/ResumeBuilderPage');

/** A response the SSE reader can consume, without depending on the environment's stream support. */
function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < frames.length
            ? { done: false, value: encoder.encode(frames[index++]) }
            : { done: true, value: undefined },
        cancel: async () => {},
      }),
    },
  } as unknown as Response;
}

/** What the `/api/ai/parse` handler returns when AI is not configured, or the provider fails. */
function failureResponse(status: number, message: string): Response {
  const body = JSON.stringify({ error: message });
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

/** What `POST /api/resumes` answers with. `resume.slug` is where the user is sent. */
function createdResponse(slug = 'li-ming-abc123'): Response {
  return {
    ok: true,
    status: 201,
    json: async () => ({ resume: { id: 'r1', slug, title: '我的简历', version: 1 } }),
  } as unknown as Response;
}

describe('创建简历向导与 AI 解析接线 (ticket 48)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    // See `ResumeStartScreen.test.tsx`: happy-dom's `Animation.cancel()` rejects a promise `motion` awaits
    // without a handler, which turns any superseded animation into a failing run.
    MotionGlobalConfig.skipAnimations = true;
    apiFetch.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    MotionGlobalConfig.skipAnimations = false;
  });

  async function settle(ms = 50): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  /**
   * Waits for a request to finish *and* for the screen to settle back.
   *
   * Two turns, because completing a parse moves the panel twice: `ai-parsing` → back to the inputs (failure)
   * or out of the panel entirely (the editor replaces the page). `AnimatePresence` `mode="wait"` mounts the
   * next view on a later tick than it removes the last, so one turn can still show the outgoing one.
   */
  async function settleThroughRequest(): Promise<void> {
    await settle();
    await settle();
  }

  /** What the editor renders and the content step does not. */
  const EDITOR_MARKER = '下载到本地';

  function mount(): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(createElement(ResumeBuilderPage));
    });
    return container;
  }

  function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
    const btn = Array.from(el.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === text
    );
    expect(btn, `no button labelled ${text}`).toBeDefined();
    return btn as HTMLButtonElement;
  }

  function required<T extends Element>(el: Element | null, what: string): T {
    expect(el, `no ${what}`).not.toBeNull();
    return el as unknown as T;
  }

  function query<T extends Element>(el: HTMLElement, selector: string): T | null {
    return el.querySelector(selector) as T | null;
  }

  function click(el: Element): void {
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  /** Types into a form field the way a user does: through the native value setter + input event. */
  function typeInto(el: HTMLElement, selector: string, value: string): void {
    const field = required<HTMLInputElement | HTMLTextAreaElement>(
      query(el, selector),
      `field ${selector}`
    );
    const proto =
      field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    act(() => {
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** Types into the paste box on the AI panel. */
  function type(el: HTMLElement, value: string): void {
    const textarea = el.querySelector('textarea');
    expect(textarea, 'no paste textarea rendered').not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )!.set!;
    act(() => {
      setter.call(textarea, value);
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** Step 1 → step 2. The wizard starts on 选择模板, so every content case has to pass through this. */
  async function toContentStep(el: HTMLElement): Promise<void> {
    click(required<HTMLElement>(query(el, '[data-step-next="style"]'), 'step 1 下一步'));
    await settle();
  }

  /** Step 2 → editor. Picking a content way no longer jumps; 下一步 is the only way forward. */
  async function toEditorFromContent(el: HTMLElement): Promise<void> {
    click(required<HTMLElement>(query(el, '[data-step-next="content"]'), 'step 2 下一步'));
    await settle();
  }

  /** Opens the AI panel on step 2 and pastes `text`, leaving the cursor one click from parsing. */
  async function composeAIParse(el: HTMLElement, text: string): Promise<void> {
    await toContentStep(el);
    click(required<HTMLElement>(query(el, '[data-way="ai"]'), 'AI card'));
    await settle();
    type(el, text);
  }

  // ─────────────────────────────────────────────────────
  // The phase machine
  // ─────────────────────────────────────────────────────

  describe('三个阶段', () => {
    it('starts on the style step, with no content way in sight', async () => {
      // The ticket's first criterion. The gallery is the *first* thing asked for, and the content ways are
      // not offered until a style exists — the old screen asked for content first and hid a template choice
      // inside it.
      const el = mount();

      expect(el.querySelectorAll('[data-template-id]').length).toBeGreaterThan(0);
      expect(query(el, '[data-way="upload"]')).toBeNull();
      expect(el.textContent).toContain('选择模板');
      expect(el.textContent).not.toContain('创建简历');
      expect(el.textContent).not.toContain('第一步：选择模板');
    });

    it('does not write a 草稿 until 下一步, for 空白创建 and 案例参考', async () => {
      const el = mount();
      await toContentStep(el);

      click(required<HTMLElement>(query(el, '[data-way="blank"]'), 'blank card'));
      await settle();

      expect(el.textContent).not.toContain(EDITOR_MARKER);
      expect(query(el, '[data-way="blank"]')).not.toBeNull();
      expect(query(el, '[data-way="blank"]')!.getAttribute('data-selected')).toBe('true');

      await toEditorFromContent(el);
      expect(el.textContent).toContain(EDITOR_MARKER);

      click(required<HTMLElement>(query(el, '[data-step-back="editor"]'), 'editor 上一步'));
      await settle();

      const seed = RESUME_SEEDS.find((entry) => entry.id !== 'blank')!;
      click(required<HTMLElement>(query(el, '[data-way="seed"]'), 'seed card'));
      await settle();
      click(required<HTMLElement>(query(el, `[data-seed-id="${seed.id}"]`), 'a seed'));
      await settle();

      expect(el.textContent).not.toContain(EDITOR_MARKER);
      expect(query(el, `[data-seed-id="${seed.id}"]`)!.getAttribute('data-selected')).toBe('true');

      await toEditorFromContent(el);
      expect(el.textContent).toContain(EDITOR_MARKER);
    });

    it('lets a click on the step indicator jump to a reachable step', async () => {
      const el = mount();

      const editorStep = required<HTMLButtonElement>(
        query(el, '[data-wizard-step="editor"]'),
        '编辑预览 step'
      );
      expect(editorStep.disabled).toBe(true);

      click(required<HTMLElement>(query(el, '[data-wizard-step="content"]'), '填写内容 step'));
      await settle();

      expect(query(el, '[data-way="upload"]')).not.toBeNull();
      expect(query(el, '[data-template-id]')).toBeNull();
    });

    it('offers every registered template, with the first one selected', async () => {
      // Deliberately not a count: ADR-0008 says template count is not a competitive dimension, and this
      // gallery has to pick up a template appended to the registry with no change here. What is pinned is
      // that the list is the registry, in the registry's order, and that the default is the first.
      const el = mount();

      const shown = Array.from(el.querySelectorAll('[data-template-id]')).map((node) =>
        node.getAttribute('data-template-id')
      );
      expect(shown).toEqual(TEMPLATE_METADATA.map((template) => template.id));

      const selected = Array.from(el.querySelectorAll('[data-template-id][data-selected="true"]'));
      expect(selected).toHaveLength(1);
      expect(selected[0]!.getAttribute('data-template-id')).toBe(TEMPLATE_METADATA[0]!.id);
    });

    it('keeps the colour when the template changes, including the default swatch', async () => {
      // The colour is a property of the resume. Switching cards must not undo a swatch the user already
      // picked — and the product default is a real colour, not "unspecified".
      const el = mount();

      const swatch = (hex: string) =>
        required<HTMLElement>(query(el, `[data-accent="${hex}"]`), `swatch ${hex}`);

      expect(swatch(DEFAULT_PRESENTATION.accentColor).getAttribute('data-selected')).toBe('true');

      click(required<HTMLElement>(query(el, '[data-template-id="verdant-banner"]'), 'verdant card'));
      await settle();

      expect(swatch(DEFAULT_PRESENTATION.accentColor).getAttribute('data-selected')).toBe('true');

      click(swatch('#557a46'));
      await settle();
      click(required<HTMLElement>(query(el, '[data-template-id="classic-centred"]'), 'classic card'));
      await settle();

      expect(swatch('#557a46').getAttribute('data-selected')).toBe('true');
    });

    it('goes back to the style step without losing the document or the metadata', async () => {
      // The ticket's central claim, end to end: 模板改变的应该是 UI 风格，而不是实际内容. A round trip through
      // step 1 must leave the document and the form exactly as they were — and the create payload is where
      // that is observable, because it carries the document and the styling side by side.
      const el = mount();
      const seed = RESUME_SEEDS.find((entry) => entry.id !== 'blank')!;

      await toContentStep(el);
      click(required<HTMLElement>(query(el, '[data-way="seed"]'), 'seed card'));
      await settle();
      click(required<HTMLElement>(query(el, `[data-seed-id="${seed.id}"]`), 'a seed'));
      await settle();
      await toEditorFromContent(el);

      expect(el.textContent).toContain(EDITOR_MARKER);

      // A metadata value the user typed, which the style step has no business touching.
      typeInto(el, 'input[name="name"]', '李明');

      // Editor → 内容 → 模板, choose a different look, then all the way forward again.
      click(required<HTMLElement>(query(el, '[data-step-back="editor"]'), 'editor 上一步'));
      await settle();
      expect(el.textContent).toContain('继续编辑');

      click(required<HTMLElement>(query(el, '[data-step-back="content"]'), 'content 上一步'));
      await settle();
      click(required<HTMLElement>(query(el, '[data-template-id="verdant-banner"]'), 'verdant card'));
      await settle();
      await toContentStep(el);
      click(buttonByText(el, '继续编辑'));
      await settle();

      expect(el.textContent).toContain(EDITOR_MARKER);
      expect((query<HTMLInputElement>(el, 'input[name="name"]')!).value).toBe('李明');

      apiFetch.mockResolvedValue(createdResponse());
      click(buttonByText(el, '保存'));
      await settleThroughRequest();

      const [, options] = apiFetch.mock.calls[0] as [string, RequestInit];
      const body = options.body as FormData;

      // The document survived, including the seed's own text…
      expect(body.get('content')).toContain(seed.body.trim().slice(0, 12));
      expect(body.get('content')).toContain('李明');
      // …and the styling is the new template's.
      expect(JSON.parse(body.get('presentation') as string).template).toBe('verdant-banner');
    });

    it('previews the chosen template in the editor, not the parsed document', async () => {
      // The third criterion: 预览不是预览 html 解析内容了，而是预览带 ui 模板的简历. Asserted on the template's
      // own token colour, which is the thing `ResumeDisplay` could not have produced.
      const el = mount();

      await toContentStep(el);
      click(required<HTMLElement>(query(el, '[data-way="blank"]'), 'blank card'));
      await settle();
      await toEditorFromContent(el);
      typeInto(el, 'input[name="name"]', '李明');

      click(buttonByText(el, '预览'));
      await settle();

      const page = required<HTMLElement>(query(el, '[data-preview-page="1"]'), 'preview page');
      expect(page.getAttribute('style')).toContain('794px');
      expect(page.innerHTML).toContain('#5c4033');
      // A 简历 header with the personal details, as the ticket requires of the preview.
      expect(page.textContent).toContain('李明');
    });

    it('falls back to the resume list when the reply carries no slug', async () => {
      // A create that answers without a slug would otherwise push `/resume/undefined` into a 404.
      const el = mount();
      apiFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ resume: {} }),
      } as unknown as Response);

      await toContentStep(el);
      click(required<HTMLElement>(query(el, '[data-way="blank"]'), 'blank card'));
      await settle();
      await toEditorFromContent(el);
      click(buttonByText(el, '保存'));
      await settleThroughRequest();

      expect(push).toHaveBeenCalledWith('/my');
    });

    it('sends the presentation as one field, with the nine camelCase keys and no version', async () => {
      // The create contract (`decodeCreatePresentation` on the Go side, pinned in
      // `internal/service/resumevault/presentation_test.go`). `version` belongs to the PATCH body: sending it
      // here is refused with 400 INVALID_PRESENTATION.
      const el = mount();
      apiFetch.mockResolvedValue(createdResponse('my-new-resume'));

      await toContentStep(el);
      click(required<HTMLElement>(query(el, '[data-way="blank"]'), 'blank card'));
      await settle();
      await toEditorFromContent(el);
      click(buttonByText(el, '保存'));
      await settleThroughRequest();

      const [path, options] = apiFetch.mock.calls[0] as [string, RequestInit];
      expect(path).toBe('/api/resumes');
      expect(options.method).toBe('POST');

      const body = options.body as FormData;
      const presentation = JSON.parse(body.get('presentation') as string);

      // Same shape as a complete presentation — not a hard-coded list, so a field added to
      // `ResumePresentation` does not have to be added here…
      expect(Object.keys(presentation).sort()).toEqual(Object.keys(DEFAULT_PRESENTATION).sort());
      // …and `version` is never one of them.
      expect(presentation).not.toHaveProperty('version');

      expect(presentation.schemaVersion).toBe(1);
      expect(presentation.template).toBe(TEMPLATE_METADATA[0]!.id);
      expect(presentation.accentColor).toBe(DEFAULT_PRESENTATION.accentColor);
      expect(presentation.sectionOrder).toEqual(DEFAULT_PRESENTATION.sectionOrder);
    });

    it('sends the user’s colour and template, and lands on the new resume', async () => {
      const el = mount();
      apiFetch.mockResolvedValue(createdResponse('li-ming-xyz'));

      click(required<HTMLElement>(query(el, '[data-template-id="verdant-banner"]'), 'verdant card'));
      await settle();
      click(required<HTMLElement>(query(el, '[data-accent="#557a46"]'), 'forest swatch'));
      await settle();

      await toContentStep(el);
      click(required<HTMLElement>(query(el, '[data-way="blank"]'), 'blank card'));
      await settle();
      await toEditorFromContent(el);
      click(buttonByText(el, '保存'));
      await settleThroughRequest();

      const [, options] = apiFetch.mock.calls[0] as [string, RequestInit];
      const presentation = JSON.parse((options.body as FormData).get('presentation') as string);

      // The colour the user picked is what gets saved…
      expect(presentation.accentColor).toBe('#557a46');
      // …and the template is the one that was chosen.
      expect(presentation.template).toBe('verdant-banner');

      // The redirect target is the created resume, not the list.
      expect(push).toHaveBeenCalledWith('/resume/li-ming-xyz');
    });
  });

  // ─────────────────────────────────────────────────────
  // The AI parse's wiring
  // ─────────────────────────────────────────────────────

  it('shows the server’s own reason when the parse fails', async () => {
    // The reported symptom. Nothing used to appear at all: the failure was stored and then rendered only in
    // the editor, which a failed parse never reaches.
    apiFetch.mockResolvedValue(failureResponse(503, '尚未配置可用的 AI 来源'));

    const el = mount();
    await composeAIParse(el, '张三 · 前端工程师');
    click(buttonByText(el, 'AI 智能解析'));
    await settleThroughRequest();

    const alert = el.querySelector('[role="alert"]');
    expect(alert, 'the failure was not rendered anywhere').not.toBeNull();
    expect(alert!.textContent).toContain('尚未配置可用的 AI 来源');

    // Retryable without retyping, and it did not open an editor on a failed parse.
    //
    // This is also the guard for the dead end the progress view first introduced: a failure arrives in
    // milliseconds, so `parsing` flips back while the progress view's *enter* animation is still running —
    // and with `AnimatePresence mode="wait"` around these views the reverse transition never resolved,
    // leaving the progress view up with no inputs behind it.
    expect(buttonByText(el, 'AI 智能解析').disabled).toBe(false);
    expect(el.textContent).not.toContain(EDITOR_MARKER);
  });

  it('names the status when the failure body is not a usable message', async () => {
    // A gateway's HTML error page must not become an English parse exception: `readErrorEnvelope` +
    // `failureText` read the body once and fall back to the status.
    apiFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => '<html>Bad Gateway</html>',
    } as unknown as Response);

    const el = mount();
    await composeAIParse(el, '张三');
    click(buttonByText(el, 'AI 智能解析'));
    await settleThroughRequest();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('AI 解析失败');
    expect(alert!.textContent).toContain('502');
  });

  it('surfaces an in-band error frame instead of accepting a truncated answer', async () => {
    // The `error` frame arrives after the stream has started. Dropping it (no `onError` handler) made a
    // mid-stream provider failure look like a short but successful parse.
    apiFetch.mockResolvedValue(
      sseResponse([
        'data: {"content":"## 工作经历\\n"}\n\n',
        'data: {"error":"提供商连接中断"}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    const el = mount();
    await composeAIParse(el, '张三');
    click(buttonByText(el, 'AI 智能解析'));
    await settleThroughRequest();

    const alert = el.querySelector('[role="alert"]');
    expect(alert, 'the in-band failure was silently dropped').not.toBeNull();
    expect(alert!.textContent).toContain('提供商连接中断');

    // It must not have opened the editor with the half-finished document.
    expect(el.textContent).not.toContain(EDITOR_MARKER);
  });

  it('shows a quiet progress while the request is in flight, then opens the editor', async () => {
    // The fetch is held open on purpose, so the progress view can be observed at the moment it matters:
    // while the user is waiting. Resolving it afterwards proves a successful parse skips 下一步 and
    // lands in the editor.
    let release!: (value: Response) => void;
    apiFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );

    const el = mount();
    await composeAIParse(el, '张三');
    click(buttonByText(el, 'AI 智能解析'));
    await settleThroughRequest();

    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.textContent).not.toContain('AI 正在解析简历');
    expect(el.textContent).not.toContain('正在等待 AI 响应');
    expect(buttonByText(el, '取消解析')).toBeDefined();
    expect(el.textContent).not.toContain(EDITOR_MARKER);

    release(sseResponse(['data: {"content":"## 工作经历\\n"}\n\n', 'data: [DONE]\n\n']));
    await settleThroughRequest();

    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toContain(EDITOR_MARKER);
  });

  it('sends pasted text, and nothing else, to the parse endpoint', async () => {
    apiFetch.mockResolvedValue(sseResponse(['data: [DONE]\n\n']));

    const el = mount();
    await composeAIParse(el, '  张三 · 前端工程师  ');
    click(buttonByText(el, 'AI 智能解析'));
    await settle();

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = apiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/ai/parse');
    expect(options.method).toBe('POST');

    const body = options.body as FormData;
    expect(body.get('text')).toBe('张三 · 前端工程师');
    expect(body.get('file')).toBeNull();
  });

  it('ignores the relative avatar path an AI parse supplies, and still lets the resume be saved', async () => {
    // The reported defect, end to end. Asked for a 简历, the model echoes a path out of the source document's
    // own media folder. It is not a URL — nothing can resolve a path relative to a file this product has
    // never seen — and while it sat in the form it did two things: it marked a field the user never filled
    // in, and it made `handleSaveToServer` refuse to save *the whole resume*, because one malformed field
    // blocks the save. The user's workaround was to delete the link by hand.
    apiFetch.mockResolvedValue(
      sseResponse([
        'data: {"content":"---\\nname: 张三\\navatar: images/X13.png\\n---\\n\\n## 工作经历\\n"}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    const el = mount();
    await composeAIParse(el, '张三');
    click(buttonByText(el, 'AI 智能解析'));
    await settleThroughRequest();

    const avatar = el.querySelector('input[name="avatar"]') as HTMLInputElement | null;
    expect(avatar, 'the editor did not open on a parsed document').not.toBeNull();
    expect(avatar!.value).toBe('');
    expect(el.textContent).not.toContain('链接格式不正确');

    // And the user is told what was ignored, rather than finding a field that looks like it was never there.
    // The document did carry the value; saying so is the difference between dropping it and hiding it.
    const notice = Array.from(el.querySelectorAll('[role="status"]')).find((n) =>
      (n.textContent ?? '').includes('images/X13.png')
    );
    expect(notice, 'the ignored value was dropped silently').toBeDefined();

    // The point of the whole exercise: 保存 runs.
    apiFetch.mockClear();
    apiFetch.mockResolvedValue(createdResponse());

    click(buttonByText(el, '保存'));
    await settleThroughRequest();

    expect(apiFetch, 'the save was refused').toHaveBeenCalled();
    expect(apiFetch.mock.calls[0][0]).toBe('/api/resumes');
    expect((apiFetch.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('reports an empty answer as a failure rather than opening an empty editor', async () => {
    apiFetch.mockResolvedValue(sseResponse(['data: [DONE]\n\n']));

    const el = mount();
    await composeAIParse(el, '张三');
    click(buttonByText(el, 'AI 智能解析'));
    await settleThroughRequest();

    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('AI 未返回有效内容');
    expect(el.textContent).not.toContain(EDITOR_MARKER);
  });
});
