/**
 * Step 2 of the creation wizard: where the *content* comes from (ticket 48).
 *
 * # What this screen stopped being
 *
 * It used to be the whole start screen, and its three cards were 上传文件 / 选择模板 / 空白创建 — where
 * 「选择模板」 really meant "start from one of twelve sample documents". Choosing a *style* and starting from
 * somebody else's *prose* were the same gesture, which is the confusion the ticket names
 * (不同简历模板改变的应该是简历的 UI 风格，而不是实际内容). The style moved to step 1 and this screen is now
 * four content ways only:
 *
 *   1. 上传文件 — a `.md` you already have;
 *   2. 空白创建 — the blank document, highlighted on click; 下一步 is what writes the 草稿;
 *   3. 案例参考 — a 内容种子 from `RESUME_SEEDS` (`ResumeSeedGallery`), i.e. prose and not a design;
 *   4. AI 智能解析 — upload or paste, parsed by the model.
 *
 * # What is pinned here
 *
 * The separation itself — no layout preview and no template choice anywhere on this step — plus the two
 * things that make back-navigation safe: 继续编辑 when a draft exists, and 上一步 reaching step 1 without
 * clearing anything (the clearing is the builder's business; this screen only has to offer the action).
 *
 * The AI path's contract is pinned here too, because it is the most delicate thing on the screen: progress
 * with the streamed text as evidence, cancellation, the inputs coming back after a failure that arrives in
 * milliseconds, and pasted text actually taking the *AI* path (the F4 defect: a button labelled AI that ran
 * local parsing). `ResumeBuilderPage.test.tsx` covers the same behaviour through the real request.
 */
// @vitest-environment happy-dom

import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionGlobalConfig } from 'framer-motion';
import { ResumeStartScreen, type ResumeStartScreenProps } from '@/components/ResumeStartScreen';
import { BLANK_SEED_ID, RESUME_SEEDS } from '@/lib/resume-template-seeds';

const defaults: ResumeStartScreenProps = {
  onStartWithFile: () => {},
  onSelectSeed: () => {},
  onSelectBlank: () => {},
  selectedSeedId: null,
  blankSelected: false,
  onStartAI: () => {},
  parsing: false,
  streamedText: '',
  onCancelAI: () => {},
  error: null,
  notice: null,
  onBack: () => {},
  hasDraft: false,
  canAdvance: false,
  onContinue: () => {},
  onAdvance: () => {},
};

function staticMarkup(overrides: Partial<ResumeStartScreenProps> = {}): string {
  return renderToStaticMarkup(
    createElement(ResumeStartScreen, { ...defaults, ...overrides })
  );
}

describe('填写内容这一步的四种方式', () => {
  it('renders no heading of its own, so the page keeps a single h1', () => {
    // The screen used to render its own centred `<h1>创建简历</h1>` while `PageContainer` rendered the
    // identical heading above it — two level-1 headings with the same text, i.e. a duplicated landmark for
    // assistive tech and a redundant block on screen.
    const html = staticMarkup();

    expect(html).not.toMatch(/<h1/);
    expect(html).toContain('上传文件');
    expect(html).toContain('空白创建');
  });

  it('offers every content way, and no way to choose a layout', () => {
    // The ticket's rule, asserted on the render: this step decides *what the resume says* and nothing
    // about how it looks. A layout preview here would be the old conflation coming back.
    const html = staticMarkup();

    for (const card of ['上传文件', '空白创建', '案例参考', 'AI 智能解析']) {
      expect(html, `missing the ${card} way`).toContain(card);
    }
    expect(html).not.toContain('data-template-id');
    expect(html).not.toContain('data-thumbnail-template');
  });

  it('puts AI 智能解析 above the other ways, and marks it as 推荐', () => {
    const html = staticMarkup();
    const ai = html.indexOf('data-way="ai"');
    const upload = html.indexOf('data-way="upload"');
    const blank = html.indexOf('data-way="blank"');
    const seed = html.indexOf('data-way="seed"');

    expect(ai).toBeGreaterThan(-1);
    expect(ai).toBeLessThan(upload);
    expect(ai).toBeLessThan(blank);
    expect(ai).toBeLessThan(seed);
    expect(html).toContain('推荐');
  });

  it('shows a failure as an alert rather than nothing', () => {
    const html = staticMarkup({ error: 'AI 解析失败（HTTP 502）' });

    expect(html).toMatch(/role="alert"/);
    expect(html).toContain('AI 解析失败（HTTP 502）');
  });

  it('shows a non-fatal advisory as a status', () => {
    const html = staticMarkup({ notice: '内容过长，已截断' });

    expect(html).toMatch(/role="status"/);
    expect(html).toContain('内容过长，已截断');
  });

  it('claims neither failure nor advisory when there is nothing to report', () => {
    // The false-positive guard: an alert region that is always present would make the two cases above
    // pass while telling the user something whenever the page merely loaded.
    const html = staticMarkup();

    expect(html).not.toMatch(/role="alert"/);
    expect(html).not.toMatch(/role="status"/);
  });

  it('says the four ways replace a draft, and offers 继续编辑 beside it', () => {
    // Back-navigation from the editor lands here, where every affordance replaces the document. Saying so
    // is the difference between "my work is about to be thrown away" and a deliberate choice.
    const idle = staticMarkup({ hasDraft: false });
    expect(idle).not.toContain('继续编辑');

    const html = staticMarkup({ hasDraft: true });
    expect(html).toContain('继续编辑');
    expect(html).toContain('已有一份草稿，继续编辑？');
    expect(html).not.toContain('下面的四种方式');
  });

  it('always offers the way back to step 1', () => {
    expect(staticMarkup()).toContain('上一步');
    expect(staticMarkup()).not.toContain('上一步：选择模板');
  });

  it('always offers 下一步, even with no draft', () => {
    expect(staticMarkup({ hasDraft: false })).toContain('下一步');
  });
});

describe('填写内容这一步的交互', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  /** The props currently rendered. `rerender` changes one and keeps the rest, as the builder does. */
  let props: ResumeStartScreenProps = defaults;

  beforeEach(() => {
    // Jump every animation to its end state instead of animating.
    //
    // Two reasons, and the second is the load-bearing one. (1) It makes the cases below fast and
    // deterministic. (2) happy-dom's `Animation.cancel()` **rejects** the promise `motion` awaits, and it
    // does so without a handler — so a transition started while another was in flight became an unhandled
    // rejection and failed the run for a reason that has nothing to do with this screen. It cannot be fixed
    // by waiting longer: `AnimatePresence` supersedes animations on re-render, which is exactly what these
    // cases do.
    MotionGlobalConfig.skipAnimations = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
    props = defaults;
    MotionGlobalConfig.skipAnimations = false;
    vi.restoreAllMocks();
  });

  function mount(overrides: Partial<ResumeStartScreenProps> = {}): HTMLDivElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    props = { ...defaults, ...overrides };
    act(() => {
      root!.render(createElement(ResumeStartScreen, props));
    });
    return container;
  }

  /** Re-renders with new props, which is how the builder drives this screen mid-parse. */
  async function rerender(
    el: HTMLElement,
    overrides: Partial<ResumeStartScreenProps>
  ): Promise<void> {
    rerenderNow(el, overrides);
    expect(el).toBeDefined();
    await settle();
  }

  /**
   * Re-renders without waiting, for state the builder can change twice in one tick.
   *
   * A parse that fails immediately — an unconfigured AI source — sets `parsing` true and then back to false
   * before the frame is out, so the two renders have to be expressible without a wait between them. Waiting
   * in between hides exactly the timing that broke the screen.
   */
  function rerenderNow(el: HTMLElement, overrides: Partial<ResumeStartScreenProps>): void {
    props = { ...props, ...overrides };
    act(() => {
      root!.render(createElement(ResumeStartScreen, props));
    });
    expect(el).toBeDefined();
  }

  /** Buttons whose visible label is exactly `text` (icons carry no text). */
  function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
    const btn = Array.from(el.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === text
    );
    expect(btn, `no button labelled ${text}`).toBeDefined();
    return btn as HTMLButtonElement;
  }

  /**
   * The same, for the choice cards, whose accessible text also carries a description.
   *
   * `data-way` is the reliable handle for the cards. It exists because the card for 案例参考 and the card for
   * AI 智能解析 are the same kind of control as the panel's own CTA, and the panel's CTA carries the identical
   * label — a text match alone cannot tell "open the AI panel" from "run the parse".
   */
  function card(el: HTMLElement, way: string): HTMLButtonElement {
    const btn = el.querySelector(`[data-way="${way}"]`);
    expect(btn, `no card for ${way}`).not.toBeNull();
    return btn as HTMLButtonElement;
  }

  function click(el: Element): void {
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  /**
   * A turn of the event loop, which is now all a view change needs.
   *
   * With `skipAnimations` the exit resolves immediately, but `AnimatePresence mode="wait"` still mounts the
   * incoming panel on a later tick, so an assertion issued synchronously after a click would see the
   * outgoing view still in place.
   */
  async function settle(ms = 50): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  /** Types into the paste box the way a user does: through the native value setter + input event. */
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

  /** Opens the AI panel — the path the reported defect describes. */
  async function openAI(el: HTMLElement): Promise<void> {
    click(card(el, 'ai'));
    await settle();
  }

  it('opens a panel for each way, and never two at once', async () => {
    const el = mount();

    click(card(el, 'upload'));
    await settle();
    expect(el.querySelector('input[type="file"]')).not.toBeNull();

    // The card grid is gone while a panel is open, so switching ways always goes through 返回.
    expect(el.querySelector('[data-way="seed"]')).toBeNull();
    click(buttonByText(el, '返回'));
    await settle();

    click(card(el, 'seed'));
    await settle();
    expect(el.querySelector('[data-seed-id]')).not.toBeNull();
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });

  it('highlights 空白创建 without writing a 草稿, and never opens a panel', async () => {
    // The one way with nothing to choose: the document is blank by definition, so a panel with a single
    // button in it would be a step for the sake of symmetry. The click is still only a choice —
    // 下一步 is what materialises it.
    const onSelectBlank = vi.fn();
    const onAdvance = vi.fn();
    const el = mount({ onSelectBlank, onAdvance });

    click(card(el, 'blank'));

    expect(onSelectBlank).toHaveBeenCalledTimes(1);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });

  it('keeps 下一步 in place, disabled until a choice or 草稿 exists', async () => {
    const onAdvance = vi.fn();
    const el = mount({ onAdvance });

    const next = buttonByText(el, '下一步');
    expect(next.disabled).toBe(true);
    click(next);
    expect(onAdvance).not.toHaveBeenCalled();

    await rerender(el, { canAdvance: true });
    expect(buttonByText(el, '下一步').disabled).toBe(false);
    click(buttonByText(el, '下一步'));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('highlights a 案例参考 without writing a 草稿', async () => {
    const onSelectSeed = vi.fn();
    const onAdvance = vi.fn();
    const el = mount({ onSelectSeed, onAdvance });
    const seed = RESUME_SEEDS.find((entry) => entry.id !== BLANK_SEED_ID)!;

    click(card(el, 'seed'));
    await settle();
    click(el.querySelector(`[data-seed-id="${seed.id}"]`)!);

    expect(onSelectSeed).toHaveBeenCalledTimes(1);
    expect(onAdvance).not.toHaveBeenCalled();
    // The whole seed, not just its id: the builder only needs `body`, and resolving it here would put the
    // lookup in two places.
    expect(onSelectSeed.mock.calls[0]![0]).toMatchObject({ id: seed.id, body: seed.body });
  });

  it('hands an uploaded file to the builder, and lets it be removed', async () => {
    const onStartWithFile = vi.fn();
    const el = mount({ onStartWithFile });

    click(card(el, 'upload'));
    await settle();

    // Attach a file the way the input's change handler receives one.
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['# 张三'], 'resume.md', { type: 'text/markdown' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true, writable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(el.textContent).toContain('resume.md');
    click(buttonByText(el, '开始编辑'));
    expect(onStartWithFile).toHaveBeenCalledWith(file);

    // …and the choice is reversible: before this the only way to change your mind was to pick another file.
    click(buttonByText(el, '移除'));
    expect(el.textContent).not.toContain('resume.md');
  });

  it('calls back to step 1 when 上一步 is pressed', async () => {
    const onBack = vi.fn();
    const el = mount({ onBack });

    click(buttonByText(el, '上一步'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('returns to the draft when 继续编辑 is pressed', async () => {
    const onContinue = vi.fn();
    const el = mount({ hasDraft: true, onContinue });

    click(buttonByText(el, '继续编辑'));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('keeps the AI button disabled until there is something to parse', async () => {
    const el = mount();
    await openAI(el);

    // Nothing entered: pressing it could only fail, so it must not be pressable.
    expect(buttonByText(el, 'AI 智能解析').disabled).toBe(true);

    type(el, '张三 · 前端工程师');

    expect(buttonByText(el, 'AI 智能解析').disabled).toBe(false);
  });

  it('sends pasted text through the AI parse path', async () => {
    // The F4 defect: this button used to run local `parseResumeMarkdown` on the paste path while still being
    // labelled "AI", so the user silently got the worse result.
    const onStartAI = vi.fn();
    const el = mount({ onStartAI });
    await openAI(el);

    type(el, '  张三 · 前端工程师  ');
    click(buttonByText(el, 'AI 智能解析'));

    expect(onStartAI).toHaveBeenCalledTimes(1);
    expect(onStartAI).toHaveBeenCalledWith('张三 · 前端工程师');
  });

  it('replaces the inputs with progress while parsing, and streams what arrives', async () => {
    const el = mount();
    await openAI(el);

    await rerender(el, { parsing: true, streamedText: '' });

    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.textContent).not.toContain('AI 正在解析简历');
    expect(el.textContent).not.toContain('正在等待 AI 响应');

    // The inputs step aside rather than sitting beside the progress view.
    expect(el.querySelector('textarea')).toBeNull();

    await rerender(el, { parsing: true, streamedText: '## 工作经历\n- 做了什么' });

    // "Something is *arriving*" — the evidence a spinner alone cannot give.
    expect(el.textContent).toContain('## 工作经历');
    expect(buttonByText(el, '取消解析')).toBeDefined();
  });

  it('gives the inputs back when a parse ends, however fast it ended', async () => {
    // The contract behind the dead end this screen first shipped: the parsing view replaces the inputs, and
    // when a parse ends — a *failure* often ends it in milliseconds, because an unconfigured AI source is the
    // common case — the inputs must come back with their text and the reason. The view swap used to sit
    // inside an `AnimatePresence mode="wait"`, which holds the incoming view until the outgoing one has
    // finished leaving.
    //
    // What this case does **not** do is prove the deadlock: it was checked against that exact
    // `AnimatePresence` and still passed, so the stalled swap is not decidable from props alone.
    // `ResumeBuilderPage.test.tsx` carries that guard, because it drives the real request path and is where
    // the frozen 「AI 正在解析…」 actually reproduced. This one pins the prop contract, and pins the timing
    // that mattered — both flips in one tick, with no wait between them.
    const el = mount();
    await openAI(el);

    type(el, '张三');

    // No wait between the two renders on purpose: that is what an immediately-failing parse does — the
    // request is answered before the enter transition is over.
    rerenderNow(el, { parsing: true, streamedText: '' });
    rerenderNow(el, { parsing: false, error: '尚未配置可用的 AI 来源' });
    await settle();

    // Both halves of "the user can carry on": the input is back with its text, and the reason is on screen.
    expect(el.querySelector('textarea')).not.toBeNull();
    expect(el.querySelector('textarea')!.value).toBe('张三');
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('尚未配置可用的 AI 来源');
    expect(buttonByText(el, 'AI 智能解析').disabled).toBe(false);
  });

  it('offers a way out of a wait that would otherwise never end', async () => {
    // The stream used to have no idle timeout, so a stalled provider meant an indefinite wait with no error
    // and no exit. Cancelling is that exit, so it has to reach the handler.
    const onCancelAI = vi.fn();
    const el = mount({ onCancelAI });
    await openAI(el);

    await rerender(el, { parsing: true, streamedText: '' });
    click(buttonByText(el, '取消解析'));

    expect(onCancelAI).toHaveBeenCalledTimes(1);
  });

  it('locks the panel, not just the button, while a parse is running', async () => {
    // Collapsing the panel or stepping back mid-parse used to be possible, which left a request running
    // against a screen that no longer showed it.
    const el = mount();
    await openAI(el);

    await rerender(el, { parsing: true, streamedText: '' });

    expect(buttonByText(el, '返回').disabled).toBe(true);
    expect(buttonByText(el, '上一步').disabled).toBe(true);
  });

  it('makes the file dropzone reachable and operable from the keyboard', async () => {
    // Its `<input type="file">` is `className="hidden"`, so the dropzone is the only route to the picker —
    // and a bare `<div onClick>` is not in the tab order at all (WCAG 2.1.1).
    const el = mount();
    await openAI(el);

    const dropzone = el.querySelector('[role="button"]');
    expect(dropzone, 'the dropzone carries no button role').not.toBeNull();
    expect(dropzone!.getAttribute('tabindex')).toBe('0');
    expect(dropzone!.getAttribute('aria-label')).toBeTruthy();

    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const open = vi.spyOn(input, 'click').mockImplementation(() => {});

    act(() => {
      dropzone!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('lets the chosen file be removed, and says which input will be used', async () => {
    // The file wins over pasted text, and there was no way to un-choose it: a user who pasted text and then
    // picked a file had no route back, and no statement of which one would be parsed.
    const el = mount();
    await openAI(el);

    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['# 张三'], 'resume.md', { type: 'text/markdown' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true, writable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(el.textContent).toContain('resume.md');

    type(el, '张三 · 前端工程师');

    // Both inputs present: the precedence has to be stated, because only one can be used.
    expect(el.textContent).toContain('本次将解析已选择的文件');

    click(buttonByText(el, '移除文件'));

    // Removing it really does hand the parse back to the pasted text.
    expect(el.textContent).not.toContain('resume.md');
    expect(el.textContent).not.toContain('本次将解析已选择的文件');
    expect(buttonByText(el, 'AI 智能解析').disabled).toBe(false);
  });

  it('sends the file rather than the text when both are present', async () => {
    // Precedence, at the handler rather than in the copy: one request, and the file is its input.
    const onStartAI = vi.fn();
    const el = mount({ onStartAI });
    await openAI(el);

    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['# 张三'], 'resume.md', { type: 'text/markdown' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true, writable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    type(el, '粘贴的文本');

    click(buttonByText(el, 'AI 智能解析'));

    expect(onStartAI).toHaveBeenCalledTimes(1);
    expect(onStartAI).toHaveBeenCalledWith(file);
  });
});
