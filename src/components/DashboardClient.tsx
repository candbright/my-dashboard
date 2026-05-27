'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ResumeCard } from './ResumeCard';
import { StaggerContainer, StaggerItem } from './ui/Animations';
import { Search, Loader2 } from 'lucide-react';
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

  const isLoading = loadingResumes;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      className="max-w-5xl mx-auto px-6 py-12"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          公共<span className="gradient-text">简历</span>
        </h1>
      </div>

      {/* Search */}
      <div className="relative mb-8 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
        <input
          type="text"
          placeholder="搜索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm
            focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
            placeholder:text-[var(--muted-foreground)]"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {filteredResumes.length === 0 ? (
            <p className="text-center py-20 text-[var(--muted-foreground)] text-sm">
              {searchQuery ? '没有匹配的简历' : '暂无公共简历'}
            </p>
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
    </motion.div>
  );
}
