import { serverFetch } from '@/lib/server-api';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ResumePageClient } from '@/components/ResumePageClient';
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

async function fetchResumeBySlug(slug: string, token?: string) {
  const res = await serverFetch(
    `/api/resumes/by-slug/${encodeURIComponent(slug)}`,
    { token },
  );
  if (!res.ok) return null;
  return res.json() as Promise<{
    resume: ResumeRecord;
    markdown: string;
    permissions: ResumePermissions;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const token = await getServerToken();
  const data = await fetchResumeBySlug(slug, token);
  if (!data) return { title: 'Resume Not Found' };

  const resume = data.resume;
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
  const data = await fetchResumeBySlug(slug, token);
  if (!data) notFound();

  const { resume, markdown, permissions } = data;
  const parsed = parseResumeMarkdown(markdown);

  return (
    <ResumePageClient
      resume={resume}
      parsed={parsed}
      markdown={markdown}
      permissions={permissions}
    />
  );
}
