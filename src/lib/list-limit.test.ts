import { describe, it, expect } from 'vitest';
import {
  APPROVAL_LIST_DEFAULT_LIMIT,
  AUDIT_LIST_DEFAULT_LIMIT,
  RESUME_LIST_DEFAULT_LIMIT,
  approvalListNoticeText,
  auditListNoticeText,
  buildListLimitNotice,
  resumeListNoticeText,
} from './list-limit';
import { readResumeList } from './resume-list';
import type { ResumeRecord } from './types';

/**
 * Tests for the frontend half of 工单 09 — reading the listing cap.
 *
 * The acceptance criterion is "前端能识别并提示": the list must recognise a capped
 * response and say so. The interesting cases are therefore the ones where a naive
 * implementation gets it wrong — a response with no metadata at all (older
 * backend), and a response whose flag contradicts its own numbers. Both must stay
 * silent, because a warning that fires when nothing is missing trains the user to
 * ignore the warning that matters.
 */

/** A minimal valid ResumeRecord; only the fields the list reads are meaningful. */
function record(id: string): ResumeRecord {
  return {
    id,
    user_id: null,
    title: `resume ${id}`,
    slug: `resume-${id}`,
    filename: `${id}.md`,
    name: null,
    job_title: null,
    email: null,
    phone: null,
    location: null,
    website: null,
    github: null,
    linkedin: null,
    avatar: null,
    summary: null,
    visibility: 'public',
    approval_status: 'approved',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function records(n: number): ResumeRecord[] {
  return Array.from({ length: n }, (_, i) => record(String(i)));
}

describe('buildListLimitNotice', () => {
  it('reports the withheld count when the flag and the numbers agree', () => {
    const notice = buildListLimitNotice({ total: 431, truncated: true, limit: 200 }, 200, 200);

    expect(notice).toEqual({ shown: 200, total: 431, withheld: 231, limit: 200 });
  });

  it('returns null when nothing was withheld', () => {
    expect(buildListLimitNotice({ total: 5, truncated: false, limit: 200 }, 5, 200)).toBeNull();
  });

  it('returns null when the response carries no metadata at all', () => {
    // An older backend answers with just the rows. Assuming truncation here would
    // warn on every page load during a rolling deploy.
    expect(buildListLimitNotice({}, 12, 200)).toBeNull();
  });

  it('returns null when truncated is set but the total does not exceed what is shown', () => {
    // Self-contradictory response: trusting the flag would render
    // "共 3 项，仅显示 5 项". The rows win.
    expect(buildListLimitNotice({ total: 3, truncated: true, limit: 200 }, 5, 200)).toBeNull();
  });

  it('returns null when truncated is set and total equals shown', () => {
    expect(buildListLimitNotice({ total: 200, truncated: true, limit: 200 }, 200, 200)).toBeNull();
  });

  it('falls back to the caller default when the server omits the limit', () => {
    const notice = buildListLimitNotice({ total: 10, truncated: true }, 4, 200);

    expect(notice?.limit).toBe(200);
  });

  it('ignores a non-positive limit and uses the default', () => {
    expect(buildListLimitNotice({ total: 10, truncated: true, limit: 0 }, 4, 200)?.limit).toBe(200);
    expect(buildListLimitNotice({ total: 10, truncated: true, limit: -1 }, 4, 200)?.limit).toBe(200);
  });

  it('treats a missing total as equal to what is shown, so the flag alone cannot warn', () => {
    // `truncated` without `total` cannot describe how much is missing; the only
    // safe reading is "no notice", since total would otherwise be fabricated.
    expect(buildListLimitNotice({ truncated: true }, 7, 200)).toBeNull();
  });

  it('counts withheld as the exact difference, not an estimate', () => {
    const notice = buildListLimitNotice({ total: 201, truncated: true, limit: 200 }, 200, 200);

    expect(notice?.withheld).toBe(1);
  });

  it('works for the approvals default as well as the resume one', () => {
    const notice = buildListLimitNotice({ total: 900, truncated: true }, 200, APPROVAL_LIST_DEFAULT_LIMIT);

    expect(notice?.limit).toBe(APPROVAL_LIST_DEFAULT_LIMIT);
  });
});

describe('readResumeList', () => {
  it('returns the rows and a notice for a truncated listing', () => {
    const { resumes, notice } = readResumeList({
      resumes: records(200),
      total: 431,
      truncated: true,
      limit: 200,
    });

    expect(resumes).toHaveLength(200);
    expect(notice).toEqual({ shown: 200, total: 431, withheld: 231, limit: 200 });
  });

  it('returns a null notice for a complete listing', () => {
    const { resumes, notice } = readResumeList({
      resumes: records(3),
      total: 3,
      truncated: false,
    });

    expect(resumes).toHaveLength(3);
    expect(notice).toBeNull();
  });

  it('treats a missing resumes key as an empty list, not as an error', () => {
    // The public listing legitimately has no rows, and `null` is what a Go nil
    // slice marshals to.
    expect(readResumeList({}).resumes).toEqual([]);
    expect(readResumeList({ resumes: null }).resumes).toEqual([]);
  });

  it('does not mutate or reorder the rows it was given', () => {
    const input = records(3);
    const { resumes } = readResumeList({ resumes: input, total: 3, truncated: false });

    expect(resumes.map((r) => r.id)).toEqual(input.map((r) => r.id));
  });

  it('uses the resume default limit constant when the server omits one', () => {
    const { notice } = readResumeList({ resumes: records(2), total: 10, truncated: true });

    expect(notice?.limit).toBe(RESUME_LIST_DEFAULT_LIMIT);
  });
});

describe('notice copy', () => {
  it('states the real total, the shown count and the cap for resumes', () => {
    const text = resumeListNoticeText({ shown: 200, total: 431, withheld: 231, limit: 200 });

    expect(text).toContain('431');
    expect(text).toContain('200');
    expect(text).toContain('份简历');
    expect(text).not.toContain('undefined');
  });

  it('names applications, not resumes, for the approvals queue', () => {
    const text = approvalListNoticeText({ shown: 200, total: 900, withheld: 700, limit: 200 });

    expect(text).toContain('900');
    expect(text).toContain('条申请');
    // The queue carries AI permission requests too, so calling them 简历 would be
    // wrong on that tab.
    expect(text).not.toContain('简历');
  });

  it('names events, not resumes, for the audit listing', () => {
    const text = auditListNoticeText({ shown: 50, total: 90, withheld: 40, limit: AUDIT_LIST_DEFAULT_LIMIT });

    expect(text).toContain('90');
    expect(text).toContain('条事件');
    expect(text).toContain(String(AUDIT_LIST_DEFAULT_LIMIT));
    expect(text).not.toContain('简历');
  });

  it('never renders a withheld count as a negative number', () => {
    const text = resumeListNoticeText({ shown: 5, total: 9, withheld: 4, limit: 5 });

    expect(text).not.toContain('-');
  });
});
