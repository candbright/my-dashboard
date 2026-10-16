import { describe, it, expect } from 'vitest';
import { computeLineDiff } from './line-diff';

const changed = (oldText: string, newText: string) =>
  computeLineDiff(oldText, newText).filter((d) => d.type !== 'unchanged');

describe('computeLineDiff', () => {
  it('reports identical text as entirely unchanged', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nb\nc');
    expect(diff.every((d) => d.type === 'unchanged')).toBe(true);
    expect(changed('a\nb\nc', 'a\nb\nc')).toEqual([]);
  });

  it('locates an inserted line', () => {
    expect(changed('a\nc', 'a\nb\nc')).toEqual([{ type: 'added', content: 'b' }]);
  });

  it('locates a deleted line', () => {
    expect(changed('a\nb\nc', 'a\nc')).toEqual([{ type: 'removed', content: 'b' }]);
  });

  it('reports a replaced line as one removal and one addition', () => {
    expect(changed('a\nold\nc', 'a\nnew\nc')).toEqual([
      { type: 'removed', content: 'old' },
      { type: 'added', content: 'new' },
    ]);
  });

  it('reconstructs both sides from the diff', () => {
    // The invariant the view depends on: every old line is either kept or removed, and
    // every new line is either kept or added. A diff that dropped a line would render a
    // version history that silently loses text.
    const oldText = '标题\n\n第一段\n第二段\n第三段';
    const newText = '标题\n第一段\n第二段改了\n第三段\n新结尾';
    const diff = computeLineDiff(oldText, newText);

    expect(diff.filter((d) => d.type !== 'added').map((d) => d.content)).toEqual(
      oldText.split('\n')
    );
    expect(diff.filter((d) => d.type !== 'removed').map((d) => d.content)).toEqual(
      newText.split('\n')
    );
  });

  it('treats a blank line as a line', () => {
    expect(changed('a\nb', 'a\n\nb')).toEqual([{ type: 'added', content: '' }]);
  });

  it('treats the final newline as an empty last line', () => {
    // Markdown written by the editor usually ends with '\n', so this is the common case,
    // not a corner: dropping the trailing newline is one line of change, not none.
    expect(changed('a\nb\n', 'a\nb')).toEqual([{ type: 'removed', content: '' }]);
  });

  it('handles Chinese text by line, not by byte', () => {
    expect(changed('姓名：张三\n技能：Go', '姓名：张三\n技能：Go、TypeScript')).toEqual([
      { type: 'removed', content: '技能：Go' },
      { type: 'added', content: '技能：Go、TypeScript' },
    ]);
  });
});
