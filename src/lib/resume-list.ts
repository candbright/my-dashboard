/**
 * The resume listing's view of 工单 09's cap.
 *
 * The generic limit logic lives in `list-limit.ts`; this module only adds the
 * resume-specific row key and wording, so that `my`/dashboard pages do not each
 * re-derive them and the approvals page does not have to import resume types.
 */

import { buildListLimitNotice, type ListLimitNotice, type ListLimitPayload, RESUME_LIST_DEFAULT_LIMIT } from './list-limit';
import type { ResumeRecord } from './types';

export type { ListLimitNotice };

/**
 * The JSON body of `GET /api/resumes`.
 *
 * Every limit field is optional: during a rolling deploy the browser can reach an
 * older backend whose proto-only route answers with just `resumes`. Treating
 * missing metadata as "complete" keeps the page working; losing the notice for a
 * few seconds is better than blanking the list.
 */
export interface ResumeListPayload extends ListLimitPayload {
  resumes?: ResumeRecord[] | null;
}

/** Rows plus the truncation notice, from one response body. */
export function readResumeList(payload: ResumeListPayload): {
  resumes: ResumeRecord[];
  notice: ListLimitNotice | null;
} {
  const resumes = payload.resumes ?? [];
  return {
    resumes,
    notice: buildListLimitNotice(payload, resumes.length, RESUME_LIST_DEFAULT_LIMIT),
  };
}
