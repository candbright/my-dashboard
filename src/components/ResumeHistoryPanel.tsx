'use client';

/**
 * The content-history panel (ticket 16, ADR-0010).
 *
 * # What this replaces
 *
 * Version history used to exist only inside an AI session: `AIUpload`'s `HistoryEntry` array,
 * lost on refresh. So the way to undo a bad autosave was to remember what the document said
 * and retype it. This panel is the persistent equivalent — one snapshot per save, kept in the
 * database, shared across sessions and devices.
 *
 * # Two panes, not one list
 *
 * A bare list of timestamps answers "when did this change" and nothing else, which is not
 * enough to decide whether to roll back. The preview is therefore the *other half* of the
 * feature rather than a detail: the user picks a revision and reads it before committing to
 * it. That is also why selecting a revision fetches its body lazily — the list response
 * deliberately carries no markdown (a 50-entry list of a 10 KB document would be half a
 * megabyte to draw a column of timestamps).
 *
 * # The rollback is a save
 *
 * ADR-0010 defines rollback as a save that **appends**: the old text is written forward as a
 * new version and nothing is deleted. So this panel never removes a row, and a mistaken
 * rollback is recoverable by rolling forward to the revision that held the "wrong" content —
 * which is still in the list. The confirmation text says so, because "恢复此版本" otherwise
 * reads like a destructive rewind.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, History, RotateCcw } from 'lucide-react';

import { Button, Card, CardBody, Chip, ConfirmModal, EmptyState, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  fetchResumeVersion,
  listResumeVersions,
  rollbackResumeVersion,
  ResumeConflictError,
  type ResumeVersionSummary,
  type SaveResumeResult,
} from '@/lib/resume-api';
import { conflictNotice, type VersionConflict } from '@/lib/version-conflict';

interface ResumeHistoryPanelProps {
  resumeId: string;
  /**
   * The version the page currently holds, used to mark the current revision.
   *
   * Passed in rather than re-read here on purpose: this is the token a rollback must send,
   * and reading it a second time inside the panel would race the `setResume` a concurrent
   * autosave schedules — the same reason the metadata form's state is lifted into
   * `ResumePageClient`.
   */
  currentVersion: number;
  canEdit: boolean;
  /** Called with the save result after a successful rollback, so the page can refresh. */
  onRestored: (result: SaveResumeResult) => void;
  onBack: () => void;
}

/** Renders an RFC 3339 instant as a local, readable date; `''` becomes a dash. */
function formatTimestamp(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A coarse relative label ("刚刚" / "3 小时前" / "2 天前").
 *
 * Deliberately coarse and computed client-side: the server sends an instant, and how long ago
 * that was is a question about the *viewer's* clock. A server-formatted "3 hours ago" is
 * wrong for anyone in a different timezone or reading a cached page.
 */
function relativeTime(value: string, now: number): string {
  if (!value) return '';
  const ms = now - new Date(value).getTime();
  if (Number.isNaN(ms)) return '';
  if (ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function ResumeHistoryPanel({
  resumeId,
  currentVersion,
  canEdit,
  onRestored,
  onBack,
}: ResumeHistoryPanelProps) {
  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [limit, setLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** The revision `preview` belongs to, so a stale body is never shown under a new row. */
  const [previewForId, setPreviewForId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<VersionConflict | null>(null);

  // The clock used for the "3 小时前" labels, in state rather than read during render.
  //
  // Two reasons it cannot be `Date.now()` at render time:
  //
  //  1. Reading the clock is impure, so a re-render could produce different text for the same
  //     props — flagged by `react-hooks/purity`.
  //  2. This component is server-rendered. The server would stamp its own `now` and the
  //     client's first render would compute a slightly different one, so every relative label
  //     could differ between the HTML and the hydration pass.
  //
  // Starting at `0` makes the first render (server and client alike) omit the relative label
  // entirely — `relativeTime` returns `''` for a missing clock — and the effect below fills it
  // in after hydration. The absolute timestamp next to it is rendered regardless, so nothing
  // the user needs is missing in the interim.
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listResumeVersions(resumeId);
      setVersions(data.versions);
      setLimit(data.limit);
      // Preselect the newest revision so the preview pane is never an empty box on open.
      setSelectedId((prev) => prev ?? data.versions[0]?.id ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '获取版本历史失败');
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    // Deliberately not `void load()`: calling the async function directly makes its
    // synchronous `setLoading(true)` run inside the effect body, which React's lint rule
    // flags as a cascading render. Deferring the first tick to a microtask keeps the same
    // behaviour while leaving the effect body free of synchronous state writes.
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Stamp the clock once the list is on screen. `versions` is the dependency rather than
  // `loading` so the label is computed against the moment the rows actually exist.
  useEffect(() => {
    if (versions.length === 0) return;
    queueMicrotask(() => setNow(Date.now()));
  }, [versions]);

  // Fetch the selected revision's body. Separate from the list request so switching rows
  // does not refetch the list, and so a slow body never blocks the list from rendering.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    // The synchronous writes here are the price of showing a spinner for the *new* row
    // immediately. React's lint rule flags them as cascading renders; the alternative is to
    // await a microtask first, which delays the spinner by a tick and is not obviously
    // better. The rule is about a real class of bug, so suppressing it is recorded rather
    // than silent — the guard below is what keeps it correct.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- spinner must start with the selection
    setPreviewLoading(true);
    setPreviewError(null);
    fetchResumeVersion(resumeId, selectedId)
      .then((detail) => {
        if (cancelled) return;
        setPreview(detail.markdown);
        // Recorded together with the body so the render can tell which revision it belongs
        // to; see `previewIsStale`.
        setPreviewForId(selectedId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewForId(selectedId);
        setPreview(null);
        setPreviewError(err instanceof Error ? err.message : '获取该版本失败');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    // The cleanup matters: clicking through revisions quickly can land an earlier response
    // after a later one, which would show the wrong body under the selected row.
    return () => {
      cancelled = true;
    };
  }, [resumeId, selectedId]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;

  // Which revision the body in `preview` actually belongs to.
  //
  // Needed because the fetch is asynchronous: switching rows leaves the previous body in
  // state while the new one is in flight. Without this the preview pane shows revision 8's
  // text under "第 9 版" until the response lands — a wrong answer presented confidently,
  // which is worse than a spinner. Comparing against `selectedId` means the stale body is
  // never rendered, and no `setPreview(null)` on selection is needed.
  const previewIsStale = previewForId !== selectedId;

  const handleRollback = useCallback(async () => {
    if (!selectedId) return;
    setRollingBack(true);
    setRollbackError(null);
    setConflict(null);
    try {
      const result = await rollbackResumeVersion(resumeId, selectedId, currentVersion);
      setConfirmOpen(false);
      onRestored(result);
    } catch (err) {
      setConfirmOpen(false);
      if (err instanceof ResumeConflictError) {
        setConflict(err.conflict);
      } else {
        setRollbackError(err instanceof Error ? err.message : '回滚失败');
      }
    } finally {
      setRollingBack(false);
    }
  }, [resumeId, selectedId, currentVersion, onRestored]);

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="py-8 px-4"
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-primary" aria-hidden />
            <h2 className="font-serif text-xl text-foreground">版本历史</h2>
            {/* The cap is surfaced rather than hidden: it explains why older revisions
                eventually disappear, which otherwise reads as data loss. */}
            {limit > 0 && (
              <Chip variant="flat" size="sm">
                {versions.length} / {limit}
              </Chip>
            )}
          </div>
          <Button variant="bordered" size="sm" onClick={onBack}>
            返回
          </Button>
        </div>

        {conflict && (
          <div className="mb-4 rounded-[2rem] border border-warning/40 bg-warning/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden />
            <div className="text-sm text-foreground">
              <p>{conflictNotice(conflict)}</p>
              <p className="mt-1 text-default-500">
                历史记录没有变化，你仍可以回到这里重试。
              </p>
            </div>
          </div>
        )}

        {rollbackError && (
          <div className="mb-4 rounded-[2rem] border border-danger/40 bg-danger/10 p-4 text-sm text-foreground">
            {rollbackError}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" label="正在加载版本历史" />
          </div>
        )}

        {!loading && loadError && (
          <EmptyState
            icon={<AlertTriangle className="w-6 h-6 text-danger" aria-hidden />}
            title="无法加载版本历史"
            description={loadError}
            action={
              <Button variant="bordered" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        )}

        {!loading && !loadError && versions.length === 0 && (
          <EmptyState
            icon={<History className="w-6 h-6 text-default-500" aria-hidden />}
            title="还没有历史版本"
            description="每次保存（包括自动保存）都会留下一条快照，保存一次后这里就会出现记录。"
          />
        )}

        {!loading && !loadError && versions.length > 0 && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            {/* ── the list ── */}
            <ul className="space-y-2" role="listbox" aria-label="版本列表">
              {versions.map((v) => {
                const isCurrent = v.version === currentVersion;
                const isSelected = v.id === selectedId;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setSelectedId(v.id)}
                      className={cn(
                        'w-full text-left rounded-[2rem] border px-4 py-3',
                        'transition-colors duration-500 ease-in-out',
                        isSelected
                          ? 'border-primary bg-content2'
                          : 'border-default-200 bg-content1 hover:bg-default-100'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          第 {v.version} 版
                        </span>
                        {isCurrent && (
                          <Chip color="success" variant="flat" size="sm">
                            当前
                          </Chip>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-default-500">
                        <span title={formatTimestamp(v.createdAt)}>
                          {formatTimestamp(v.createdAt)}
                        </span>
                        {relativeTime(v.createdAt, now) && (
                          <span className="ml-2">· {relativeTime(v.createdAt, now)}</span>
                        )}
                      </div>
                      {/* An empty author is a real case, not a missing value: an AI apply or
                          a system task saves with no authenticated user. Saying so is more
                          honest than an em dash that reads as "unknown". */}
                      <div className="mt-0.5 text-xs text-default-500">
                        {v.createdBy ? `由 ${v.createdBy.slice(0, 8)} 保存` : '由系统保存'}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* ── the preview ── */}
            <Card variant="bordered">
              <CardBody>
                {selected ? (
                  <>
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <p className="font-serif text-foreground">第 {selected.version} 版</p>
                        <p className="text-xs text-default-500">
                          {formatTimestamp(selected.createdAt)}
                        </p>
                      </div>
                      {canEdit && (
                        <Button
                          color="primary"
                          size="sm"
                          startContent={<RotateCcw className="w-4 h-4" />}
                          isDisabled={selected.version === currentVersion || rollingBack}
                          onClick={() => setConfirmOpen(true)}
                          title={
                            selected.version === currentVersion
                              ? '这已经是当前版本'
                              : '恢复此版本'
                          }
                        >
                          恢复此版本
                        </Button>
                      )}
                    </div>

                    {previewLoading || previewIsStale ? (
                      <div className="flex justify-center py-10">
                        <Spinner label="正在加载内容" />
                      </div>
                    ) : previewError ? (
                      <p className="text-sm text-danger">{previewError}</p>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground bg-content2 rounded-[2rem] p-4 max-h-[32rem] overflow-auto">
                        {preview || '（这一版的内容是空的）'}
                      </pre>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-default-500">从左侧选择一个版本查看内容。</p>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleRollback()}
        title="恢复此版本"
        message={
          selected
            ? `将把内容恢复到第 ${selected.version} 版，并作为一个新版本保存。` +
              '当前的版本与中间的所有版本都会保留在历史里，因此这个操作可以再撤销。'
            : ''
        }
        confirmLabel="恢复"
        loading={rollingBack}
      />
    </motion.div>
  );
}
