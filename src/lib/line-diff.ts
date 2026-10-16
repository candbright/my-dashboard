/**
 * A line-level diff for the version-history view.
 *
 * It lives in `lib/` rather than in `AIUpload.tsx` for the repo's usual reason: it is pure
 * logic, and a `.tsx` module cannot be imported by a test or a node script. The algorithm is
 * the straightforward O(m·n) longest-common-subsequence walk — version histories are a few
 * hundred lines and the view shows one diff at a time, so this costs less than a dependency.
 */

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffLineType;
  content: string;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length, n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const diff: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: 'unchanged', content: oldLines[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'added', content: newLines[j - 1] }); j--;
    } else {
      diff.unshift({ type: 'removed', content: oldLines[i - 1] }); i--;
    }
  }
  return diff;
}
