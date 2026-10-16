'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ResumeCard } from './ResumeCard';
import { StaggerContainer, StaggerItem, Spinner, EmptyState, Input, Button, ListLimitNotice } from './ui';
import { PageContainer } from './layout/PageContainer';
import { Search, FileText, AlertCircle } from 'lucide-react';
import type { ResumeRecord } from '@/lib/types';
import { apiFetch } from '@/lib/api-client';
import { readJsonBody } from '@/lib/http-json';
import { readResumeList, type ResumeListPayload } from '@/lib/resume-list';
import { type ListLimitNotice as ListLimitInfo } from '@/lib/list-limit';

export function DashboardClient() {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [listNotice, setListNotice] = useState<ListLimitInfo | null>(null);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  /**
   * Set when the listing request failed, as opposed to returning nothing.
   *
   * Without it the two were indistinguishable: the `.catch` below emptied `resumes`, so a failed
   * request rendered 「还没有人发布公开简历」 — a claim about *other people's* data, and a false one.
   * Whether the library is empty is exactly what the user came to find out, so this must not be
   * answered by guesswork.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Bumped by the retry button to re-run the fetch effect. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    /*
     * Nothing is written to state synchronously here, deliberately — see `app/my/page.tsx` for the
     * full reasoning. `react-hooks/set-state-in-effect` reads the effect body directly, so the writes
     * were moved to the retry handler, which is what actually causes a reload.
     */
    apiFetch('/api/resumes')
      .then((res) => readJsonBody<ResumeListPayload>(res, '加载公共简历失败'))
      .then((result) => {
        if (cancelled) return;
        // Failure is checked first, so it can never reach the empty state below.
        if (!result.ok) {
          // `resumes` is left alone: a failed refresh must not erase a list already on screen.
          setLoadError(result.error);
          setListNotice(null);
          return;
        }
        // Bounded read: keep the truncation metadata so the page can admit that
        // older public resumes were not returned (工单 09).
        const { resumes: rows, notice } = readResumeList(result.data);
        setResumes(rows);
        setListNotice(notice);
      })
      .catch((err: unknown) => {
        // Only a transport failure reaches here; HTTP errors are values from `readJsonBody`.
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '加载公共简历失败，请稍后重试');
        setListNotice(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingResumes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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

      {/* Truncation notice. The noun differs from the dashboard wording: this is
          the public library, so "共 N 份公开简历" is the honest phrasing. */}
      <ListLimitNotice
        notice={listNotice}
        message={
          listNotice
            ? `共 ${listNotice.total} 份公开简历，当前仅显示最新的 ${listNotice.shown} 份（单次上限 ${listNotice.limit} 份）。更早发布的简历未列出。`
            : undefined
        }
      />

      {/* Content */}
      {loadingResumes ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" label="加载中..." />
        </div>
      ) : loadError ? (
        /*
         * Checked before the empty state, so a failed request never renders the claim that nobody
         * has published anything. The retry matters here more than on a personal page: the user has
         * no other way to find out whether the library is genuinely empty.
         */
        <div className="rounded-[2rem] border border-danger/30 bg-danger/5 px-6 py-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-danger" />
          <h2 className="mb-1 font-serif text-lg font-semibold text-foreground">
            公共简历加载失败
          </h2>
          <p className="mb-5 text-sm text-default-500">{loadError}</p>
          <Button
            variant="bordered"
            radius="full"
            onClick={() => {
              // Cleared on the click that retries, not on every run of the fetch effect.
              setLoadError(null);
              setLoadingResumes(true);
              setReloadKey((n) => n + 1);
            }}
          >
            重新加载
          </Button>
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
