'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { conflictNotice, formatLastModified, type VersionConflict } from '@/lib/version-conflict';

/**
 * The banner shown when a save was refused because the resume moved (ticket 12,
 * ADR-0010).
 *
 * Why a banner and not a toast: a toast disappears after a few seconds and takes the
 * only explanation of what happened with it. This state persists until the user acts,
 * because "my save did nothing" is not a thing to gloss over — and the decision it asks
 * for (reload and re-apply, or keep editing) is one the user has to make deliberately.
 *
 * It never offers to discard the draft. There is no "take the server's version" button
 * for the document the user is typing, because that is the one action that would destroy
 * their work, and ADR-0010 forbids merging automatically for the same reason.
 */
interface ConflictNoticeProps {
  conflict: VersionConflict;
  reloading: boolean;
  onReload: () => void;
  onDismiss: () => void;
}

export function ConflictNotice({
  conflict,
  reloading,
  onReload,
  onDismiss,
}: ConflictNoticeProps) {
  return (
    <div className="px-4 pt-24 pb-2">
      <div
        role="alert"
        className="mx-auto max-w-3xl rounded-[2rem] border border-warning/40 bg-warning/5 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <TriangleAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 className="font-serif text-base text-foreground">
              {conflict.missingVersion ? '无法确认最新版本' : '这份简历已被改动'}
            </h2>

            <p className="mt-2 text-sm text-default-600 leading-relaxed">
              {conflictNotice(conflict)}
            </p>

            {/* The two facts behind "已被改动", as a table so they are scannable
                rather than buried in the sentence above. */}
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-default-500">
              {conflict.currentVersion !== null && (
                <div className="flex gap-1.5">
                  <dt>服务端版本</dt>
                  <dd className="text-foreground">{conflict.currentVersion}</dd>
                </div>
              )}
              {conflict.expectedVersion !== null && conflict.expectedVersion > 0 && (
                <div className="flex gap-1.5">
                  <dt>你编辑的版本</dt>
                  <dd className="text-foreground">{conflict.expectedVersion}</dd>
                </div>
              )}
              {formatLastModified(conflict.lastModifiedAt) && (
                <div className="flex gap-1.5">
                  <dt>最后修改于</dt>
                  <dd className="text-foreground">
                    {formatLastModified(conflict.lastModifiedAt)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                color="primary"
                variant="solid"
                isLoading={reloading}
                onClick={onReload}
              >
                {!reloading && <RefreshCw className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                载入最新内容（保留我的修改）
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismiss} isDisabled={reloading}>
                继续编辑
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
