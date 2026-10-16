// @vitest-environment happy-dom

/**
 * The mixed-component editor: add paragraph / entry / chip, chip-by-chip
 * maintenance, and block reorder labels that must not collide with section
 * 「上移「…」」 names.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'framer-motion';
import { ResumeSectionBlocksEditor } from '@/components/ResumeSectionBlocksEditor';
import {
  createEmptyChip,
  createEmptyChipGroupBlock,
  createEmptyParagraphBlock,
  type EditableBlock,
} from '@/lib/resume-builder';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  MotionGlobalConfig.skipAnimations = false;
});

function Harness({ initial = [] as EditableBlock[] }: { initial?: EditableBlock[] }) {
  const [blocks, setBlocks] = useState<EditableBlock[]>(initial);
  return createElement(ResumeSectionBlocksEditor, {
    blocks,
    onChange: setBlocks,
  });
}

function mount(initial: EditableBlock[] = []): HTMLDivElement {
  act(() => {
    root!.render(createElement(Harness, { initial }));
  });
  return container!;
}

function clickNamed(el: HTMLElement, name: string) {
  const btn = Array.from(el.querySelectorAll('button')).find(
    (node) => (node.textContent ?? '').replace(/\s+/g, '') === name
      || node.getAttribute('aria-label') === name,
  );
  expect(btn, `no button named ${name}`).toBeDefined();
  act(() => {
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('ResumeSectionBlocksEditor', () => {
  it('offers 段落 / 条目 / 标签 from the add menu', () => {
    const el = mount();
    clickNamed(el, '添加');

    const labels = Array.from(el.querySelectorAll('button')).map((node) =>
      (node.textContent ?? '').replace(/\s+/g, ''),
    );
    expect(labels).toEqual(expect.arrayContaining(['段落', '条目', '标签']));
  });

  it('adds a paragraph, an entry, and a chip group as three separate blocks', () => {
    const el = mount();
    clickNamed(el, '添加');
    clickNamed(el, '段落');
    clickNamed(el, '添加');
    clickNamed(el, '条目');
    clickNamed(el, '添加');
    clickNamed(el, '标签');

    expect(el.querySelectorAll('textarea').length).toBe(1);
    expect(el.querySelector('input[placeholder="标题（如：高级开发工程师）"]')).not.toBeNull();
    expect(el.querySelector('input[aria-label="编辑标签"]')).not.toBeNull();
  });

  it('appends a chip to the previous chip group instead of opening a second group', () => {
    const group = createEmptyChipGroupBlock('TypeScript');
    const el = mount([group]);

    clickNamed(el, '添加');
    clickNamed(el, '标签');

    const chipInputs = el.querySelectorAll('input[aria-label="编辑标签"]');
    const chipTexts = Array.from(el.querySelectorAll('span')).map((n) => n.textContent ?? '');
    expect(chipInputs.length + chipTexts.filter((t) => t.includes('TypeScript')).length).toBeGreaterThan(0);
    expect(el.querySelectorAll('[aria-label="将标签组上移"]').length).toBe(1);
  });

  it('deletes the group when its last chip is removed', () => {
    const group = createEmptyChipGroupBlock('Go');
    const el = mount([group]);

    clickNamed(el, '删除标签「Go」');
    expect(el.querySelector('[aria-label="将标签组上移"]')).toBeNull();
    expect(el.textContent).not.toContain('Go');
  });

  it('rejects an empty chip on commit', () => {
    const empty = createEmptyChip();
    const group = {
      ...createEmptyChipGroupBlock(),
      chips: [empty],
    };
    const el = mount([group]);

    const input = el.querySelector('input[aria-label="编辑标签"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    act(() => {
      input!.focus();
      input!.blur();
    });

    expect(el.querySelector('[aria-label="将标签组上移"]')).toBeNull();
  });

  it('names inner-block moves without 移「, so they cannot collide with section reorder', () => {
    const el = mount([
      { ...createEmptyParagraphBlock(), text: '甲' },
      { ...createEmptyParagraphBlock(), text: '乙' },
    ]);

    const labels = Array.from(el.querySelectorAll('[aria-label]')).map(
      (node) => node.getAttribute('aria-label') ?? '',
    );
    expect(labels).toContain('将段落上移');
    expect(labels).toContain('将段落下移');
    expect(labels.some((label) => label.includes('移「'))).toBe(false);
  });
});
