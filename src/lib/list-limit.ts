/**
 * Listing limits and their notice copy.
 *
 * The backend caps every listing (工单 09: hard limit, no pagination yet) and
 * reports `total` / `truncated` so a capped read can never be mistaken for a
 * complete one. This module is the single place the frontend interprets that
 * metadata, so the "is this even truncated?" rule cannot drift between the pages
 * that show a list.
 *
 * It is generic over *what* is listed — resumes and approval requests both use it
 * — and deliberately does not import either resource's types, so an approvals
 * page never has to depend on a resume module. The cost is that listing helpers
 * take the rows and their count separately rather than plucking them from a
 * typed body.
 *
 * Domain vocabulary (CONTEXT.md): a **listing** (列表) is a bounded read; `total`
 * is the number of rows matching the filter, ignoring the limit. Real pagination
 * (分页) arrives with 工单 30 — until then the client can only say that rows were
 * withheld, not offer a next page.
 */

/** Mirrors `rvbiz.DefaultListLimit` in kratos-server. */
export const RESUME_LIST_DEFAULT_LIMIT = 200;

/** Mirrors `approvalbiz.DefaultListLimit` in kratos-server. */
export const APPROVAL_LIST_DEFAULT_LIMIT = 200;

/** Mirrors `audit.DefaultListLimit` in kratos-server (ADR-0011). */
export const AUDIT_LIST_DEFAULT_LIMIT = 50;

/**
 * The metadata every capped listing reports.
 *
 * All three fields are optional on purpose. During a rolling deploy the browser
 * can reach an older backend whose proto-only route answers without them;
 * treating missing metadata as "complete" keeps the page working, and losing the
 * notice for a few seconds is better than blanking the list.
 */
export interface ListLimitPayload {
  total?: number | null;
  truncated?: boolean | null;
  limit?: number | null;
}

/** How a listing was cut short, ready to render — or `null` when it was not. */
export interface ListLimitNotice {
  /** Rows received, i.e. what the user can actually see. */
  shown: number;
  /** Rows that matched, ignoring the limit. */
  total: number;
  /** Rows withheld because of the limit. Always `total - shown` when truncated. */
  withheld: number;
  /** The limit the server applied, for the "上限 N" wording. */
  limit: number;
}

/**
 * Decides whether a response was truncated, and by how much.
 *
 * `shown` is passed in rather than derived here because the row key differs per
 * listing (`resumes` vs `requests`) and this module must not know either.
 *
 * Returns `null` when nothing was withheld, which is the common case. Two things
 * are deliberately *not* treated as truncation:
 *
 * - A missing `truncated` flag (older backend) — see the type comment above.
 * - A response where the numbers disagree with the flag. If `truncated` is set but
 *   `total <= shown`, showing "共 3 项，仅显示 5 项" would be nonsense, so the notice
 *   is suppressed and the rows win. A wrong warning is worse than no warning: it
 *   teaches the user to ignore the real one.
 */
export function buildListLimitNotice(
  payload: ListLimitPayload,
  shown: number,
  defaultLimit: number
): ListLimitNotice | null {
  const total = typeof payload.total === 'number' ? payload.total : shown;

  if (!payload.truncated || total <= shown) return null;

  return {
    shown,
    total,
    withheld: total - shown,
    limit:
      typeof payload.limit === 'number' && payload.limit > 0 ? payload.limit : defaultLimit,
  };
}

/**
 * The user-facing sentence for a resume listing.
 *
 * Names 简历 explicitly rather than saying 项, because the reader of this page is
 * the owner of the data and needs to recognise it as *their* resumes.
 */
export function resumeListNoticeText(notice: ListLimitNotice): string {
  return `共 ${notice.total} 份简历，当前仅显示最新的 ${notice.shown} 份（单次上限 ${notice.limit} 份）。较早的简历未列出。`;
}

/**
 * The user-facing sentence for the approvals queue.
 *
 * Says 待处理申请 rather than 简历 because the same queue carries AI permission
 * requests, and it does not claim the missing ones are "older": the queue is
 * ordered by update time and can be filtered by type, so what was withheld is
 * simply beyond the cap.
 */
export function approvalListNoticeText(notice: ListLimitNotice): string {
  return `共 ${notice.total} 条申请，当前仅显示 ${notice.shown} 条（单次上限 ${notice.limit} 条）。其余申请未列出，请先用筛选缩小范围。`;
}

/**
 * The user-facing sentence for an audit / activity listing.
 *
 * Names 事件 rather than 申请 or 简历: the same list holds authentication
 * attempts and mutations, and claiming the withheld rows are "older" would be
 * wrong once the viewer has filtered by action.
 */
export function auditListNoticeText(notice: ListLimitNotice): string {
  return `共 ${notice.total} 条事件，当前仅显示 ${notice.shown} 条（单次上限 ${notice.limit} 条）。其余事件未列出，请先用筛选缩小范围。`;
}
