import { serverFetch } from '@/lib/server-api';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import { notFound } from 'next/navigation';
import { ResumePageClient } from '@/components/ResumePageClient';
import type { Metadata } from 'next';
import type { ResumeRecord, ResumePermissions } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function fetchResumeBySlug(slug: string) {
  const res = await serverFetch(`/api/resumes/by-slug/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return res.json() as Promise<{
    resume: ResumeRecord;
    markdown: string;
    permissions: ResumePermissions;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchResumeBySlug(slug);
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
  const data = await fetchResumeBySlug(slug);
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
