'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { type ListLimitNotice as ListLimitNoticeInfo } from '@/lib/list-limit';

/**
 * ListLimitNotice tells the user that a listing was capped.
 *
 * It exists because a bounded read that looks complete is worse than an unbounded
 * one: the resume and approval listings now return at most their `DefaultListLimit`
 * rows (工单 09), so without this the user would simply not see the older rows and
 * would have no way to tell that from "they were never created".
 *
 * Rendered as `role="status"` rather than `alert`: it is a persistent property of
 * the list on screen, not a transient event that should interrupt a screen
 * reader. The default tone is `warning` because what the user is missing is
 * theirs, so it has to be noticeable — a muted caption would be ignored, which is
 * the failure this component prevents.
 *
 * Real pagination is 工单 30; until then this states the fact and does not offer a
 * "next page" that does not exist.
 */
interface ListLimitNoticeProps {
  notice: ListLimitNoticeInfo | null;
  /**
   * The sentence to show. Required: the copy names the listed thing (简历 /
   * 申请), and a default here would silently say the wrong noun on one of the two
   * pages. Callers use `resumeListNoticeText` / `approvalListNoticeText`.
   */
  message: string | undefined;
  tone?: 'warning' | 'default';
  className?: string;
}

export function ListLimitNotice({
  notice,
  message,
  tone = 'warning',
  className,
}: ListLimitNoticeProps) {
  if (!notice || !message) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 mb-5 p-3 rounded-[2rem] text-sm leading-relaxed',
        tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-default-100 text-default-600',
        className
      )}
    >
      <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

