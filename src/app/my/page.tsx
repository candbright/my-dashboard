'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ResumeCard } from '@/components/ResumeCard';
import { StaggerContainer, StaggerItem, Spinner, EmptyState, Input, Button } from '@/components/ui';
import { PageContainer, AuthGuard } from '@/components/layout';
import { Search, Plus, FileText } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import type { ResumeRecord } from '@/lib/types';

export default function MyResumesPage() {
  return (
    <AuthGuard>
      <MyResumesContent />
    </AuthGuard>
  );
}

function MyResumesContent() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoadingResumes(true);
    apiFetch('/api/resumes?scope=mine')
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

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这份简历吗？')) return;
    try {
      const res = await apiFetch(`/api/resumes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setResumes((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  return (
    <PageContainer
      title="我的"
      titleAccent="简历"
      action={
        <Link href="/upload">
          <Button
            color="primary"
            variant="solid"
            startContent={<Plus className="w-4 h-4" />}
          >
            创建
          </Button>
        </Link>
      }
    >
      {/* Search */}
      <div className="mb-5 max-w-sm">
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
              title={searchQuery ? '没有匹配的简历' : '还没有简历'}
              description={searchQuery ? '试试其他关键词' : '点击顶部创建按钮开始创建你的简历'}
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
                    isOwner={true}
                    isAdmin={user?.role === 'admin'}
                    onDelete={handleDelete}
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
