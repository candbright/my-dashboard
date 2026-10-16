/**
 * Shared TypeScript types for the application.
 * These types mirror the kratos-server API response shapes.
 */

export type UserRole = 'admin' | 'user';
export type Visibility = 'public' | 'private';
/**
 * The approval states the API can report (`approval.go`).
 *
 * No `'draft'`: a resume that has never been submitted is `'pending'` with no request row, and
 * `ResumeCard`'s fallback branch already renders "never asked for approval". A local-only value
 * in this union would be a state the server cannot produce, which is how a UI branch ends up
 * rendering a status no user can ever be in.
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ResumeRecord {
  id: string;
  user_id: string | null;
  title: string;
  slug: string;
  filename: string;
  name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
  github: string | null;
  linkedin: string | null;
  avatar: string | null;
  summary: string | null;
  visibility: Visibility;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  /**
   * The optimistic-lock token (ADR-0010).
   *
   * Read it from a response and send it back on the next save. The server refuses a
   * save whose version no longer matches, which is what stops two tabs from silently
   * overwriting each other. Always present on responses from the current server; the
   * `?` is there because a response cached before ticket 12 would not have it, and a
   * missing token must surface as a refusal rather than as `undefined` being sent.
   */
  version?: number;
  /**
   * How the resume looks (ticket 19, ADR-0004).
   *
   * Only `GET /api/resumes/{id}` returns this, so it is optional: the list routes do not carry
   * it, and a component that reads it must fall back to the defaults rather than assume it is
   * there.
   *
   * Typed loosely on purpose, and read through `presentationFromApi` /
   * `presentationFromRecord` in `resume-presentation.ts` rather than directly. Those fill every
   * absent field and accept either key spelling, so callers never handle a partial object or
   * guess a key name. The authoritative type is `ResumePresentation`, which narrows `template`
   * and `fontFamily` to their closed sets; repeating that union here would be a second
   * definition of it.
   */
  presentation?: unknown;
}

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  ai_enabled: boolean;
  created_at: string;
}

export interface ResumePermissions {
  can_edit: boolean;
  can_delete: boolean;
  can_view_source: boolean;
  can_export_pdf: boolean;
  can_change_visibility: boolean;
  is_owner: boolean;
  is_admin: boolean;
}
