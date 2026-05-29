'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ResumeCard } from './ResumeCard';
import { StaggerContainer, StaggerItem, Spinner, EmptyState, Input } from './ui';
import { PageContainer } from './layout/PageContainer';
import { Search, FileText } from 'lucide-react';
import type { ResumeRecord } from '@/lib/types';
import { apiFetch } from '@/lib/api-client';

export function DashboardClient() {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoadingResumes(true);
    apiFetch('/api/resumes')
      .then((res) => res.json())
      .then((data) => setResumes(data.resumes || []))
      .catch(() => setResumes([]))
      .finally(() => setLoadingResumes(false));
  }, []);

  const filteredResumes = resumes.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.name?.toLowerCase().includes(q) ||
      r.job_title?.toLowerCase().includes(q) ||
      r.location?.toLowerCase().includes(q)
    );
  });

  return (
    <PageContainer title="公共" titleAccent="简历">
      {/* Search */}
      <div className="mb-8 max-w-sm">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索简历..."
          variant="flat"
          startContent={<Search className="w-4 h-4" />}
        />
      </div>

      {/* Content */}
      {loadingResumes ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" label="加载中..." />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {filteredResumes.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-7 h-7 text-default-400" />}
              title={searchQuery ? '没有匹配的简历' : '暂无公共简历'}
              description={searchQuery ? '试试其他关键词' : '还没有人发布公开简历'}
            />
          ) : (
            <StaggerContainer
              key="grid"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
            >
              {filteredResumes.map((resume) => (
                <StaggerItem key={resume.id}>
                  <ResumeCard
                    id={resume.id}
                    title={resume.title}
                    slug={resume.slug}
                    jobTitle={resume.job_title}
                    location={resume.location}
                    summary={resume.summary}
                    createdAt={resume.created_at}
                    visibility={resume.visibility}
                    approvalStatus={resume.approval_status}
                  />
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </AnimatePresence>
      )}
    </PageContainer>
  );
}
