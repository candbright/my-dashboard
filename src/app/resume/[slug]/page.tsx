import { serverFetch } from '@/lib/server-api';
import {
  lookupResumeBySlug,
  type ResumeLookup,
} from '@/lib/resume-lookup';
import { slugPathSegment } from '@/lib/resume-slug';
import {
  parseResumeMarkdown,
  parsedFromStructuredContent,
  withMetadata,
} from '@/lib/resume-parser';
import type { StructuredContent } from '@/lib/resume-model';
import { resumeWithPresentation } from '@/lib/resume-presentation';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ResumePageClient } from '@/components/ResumePageClient';
import { ResumeUnavailablePage } from '@/components/ResumeUnavailablePage';
import type { Metadata } from 'next';
import type { ResumeRecord, ResumePermissions } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Read auth token from cookie (synced by api-client setToken). */
async function getServerToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get('auth_token')?.value;
}

/** The body of a successful `by-slug` answer. */
interface ResumeDetail {
  resume: ResumeRecord;
  markdown: string;
  permissions: ResumePermissions;
  /** The server's parsed body (ticket 18). Absent from a server that predates it. */
  content?: StructuredContent;
  /**
   * How the resume looks (ticket 19, ADR-0004) — a **sibling** of the record, which is where the
   * proto puts it; `ResumeInfo` has no styling field. {@link resumeWithPresentation} is what folds it
   * in, and it is not optional in practice: dropping it rendered every stored style as the default.
   */
  presentation?: unknown;
}

/**
 * Looks the slug up, keeping the *reason* a failure is a failure.
 *
 * The reasons used to be flattened into `null` right here, and `null` was rendered as 「页面不存在」.
 * `readResumeLookup` carries them through instead; only its `missing` outcome is a 404.
 *
 * The segment goes through `slugPathSegment` rather than `encodeURIComponent`, because `params.slug`
 * arrives **already percent-encoded** and encoding it again asked the backend for a slug no row has —
 * a `404` the page then reported as 「页面不存在」. See `lib/resume-slug.ts`.
 */
function fetchResumeBySlug(slug: string, token?: string): Promise<ResumeLookup<ResumeDetail>> {
  return lookupResumeBySlug<ResumeDetail>(() =>
    serverFetch(`/api/resumes/by-slug/${slugPathSegment(slug)}`, { token })
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const token = await getServerToken();
  const lookup = await fetchResumeBySlug(slug, token);

  // The tab title is a claim about the resume too, so it follows the same three outcomes as the
  // page. 「Resume Not Found」 for a resume that exists but was refused is the same lie in smaller type.
  if (lookup.status === 'missing') return { title: '页面不存在 — Resume' };
  if (lookup.status !== 'found') return { title: '无法访问 — Resume' };

  const resume = lookup.data.resume;
  return {
    title: `${resume.name || resume.title} — Resume`,
    description: resume.job_title
      ? `${resume.name} — ${resume.job_title}`
      : `Resume of ${resume.name || resume.title}`,
  };
}

export default async function ResumePage({ params }: PageProps) {
  const { slug } = await params;
  const token = await getServerToken();
  const lookup = await fetchResumeBySlug(slug, token);

  // A slug that does not exist is the one case that is really a 404. Everything else keeps its own
  // explanation: `403 NO_ACCESS` means this page was served without the session that owns the
  // resume — typically the cookie lagging the client's token, which one reload fixes — and a 5xx
  // means nothing about the resume is known at all.
  if (lookup.status === 'missing') notFound();
  if (lookup.status !== 'found') {
    return (
      <ResumeUnavailablePage
        reason={lookup.status}
        slug={slug}
        detail={lookup.status === 'unavailable' ? lookup.detail : undefined}
      />
    );
  }

  const { resume, markdown, permissions, content, presentation } = lookup.data;
  // The document holds no frontmatter (ADR-0003), so the metadata has to come from the
  // columns. Normalising here — the first place both the record and the parsed body are
  // in hand — is what makes the preview, the print/PDF view, the plain-text export and
  // the resume naming all correct without any of them knowing about the columns.
  //
  // The *structure* comes from the server's snapshot when it sent one (ticket 18): the
  // server parser is the authority, and parsing again here would be a second opinion that
  // could disagree with the API. An empty snapshot is still a snapshot — it means the server
  // looked and found no sections — so the test is on the field being present, not on it
  // having content. Only a deployment that predates ticket 18 falls back to parsing.
  const parsed =
    content !== undefined
      ? parsedFromStructuredContent(content, resume, undefined, markdown)
      : withMetadata(parseResumeMarkdown(markdown), resume);

  return (
    <ResumePageClient
      // The styling arrives beside the record and the client reads it inside the record, so it is
      // folded in here — the boundary every consumer of this page shares.
      resume={resumeWithPresentation(resume, presentation)}
      parsed={parsed}
      markdown={markdown}
      permissions={permissions}
    />
  );
}
