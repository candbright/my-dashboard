'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ResumeCard } from '@/components/ResumeCard';
import { StaggerContainer, StaggerItem, Spinner, EmptyState, Input, Button, ConfirmModal, useToast, ToastContainer, ListLimitNotice } from '@/components/ui';
import { PageContainer, AuthGuard } from '@/components/layout';
import { Search, Plus, FileText, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { readJsonBody } from '@/lib/http-json';
import { readResumeList, type ResumeListPayload } from '@/lib/resume-list';
import { resumeListNoticeText, type ListLimitNotice as ListLimitInfo } from '@/lib/list-limit';
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
  const [listNotice, setListNotice] = useState<ListLimitInfo | null>(null);
  const [loadingResumes, setLoadingResumes] = useState(true);
  /**
   * Set when the listing request failed, as opposed to returning nothing.
   *
   * Without this the two cases were indistinguishable on screen: the `.catch` below emptied
   * `resumes`, so a failed request rendered the same 「还没有简历」 empty state as a genuinely empty
   * account. On a user's own resume page that is the worst possible reading — "还没有简历" looks
   * like **"我的简历被删了"**, and the user's next move is to panic or re-upload, not to retry. The
   * failure has to be visible to be recoverable.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Bumped by the retry button to re-run the fetch effect. */
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    /*
     * Nothing is written to state synchronously here, deliberately.
     *
     * `setLoadingResumes(true)` would be redundant on mount (`loadingResumes` already initialises to
     * `true`) and `setLoadError(null)` belongs to the click that retries rather than to every run of
     * the effect. Both were also cascading renders, which `react-hooks/set-state-in-effect` rejects —
     * the rule reads the effect body directly, so the fix is to move the writes to their real cause
     * (the retry handler) instead of appeasing the rule.
     */
    apiFetch('/api/resumes?scope=mine')
      .then((res) => readJsonBody<ResumeListPayload>(res, '加载简历列表失败'))
      .then((result) => {
        if (cancelled) return;
        // Checked before `ok` is used, so a failure can never fall through into the empty state.
        if (!result.ok) {
          // `resumes` is deliberately left as-is rather than emptied: a failed *refresh* must not
          // destroy a list that is already on screen. The error is what tells the user the contents
          // are unknown, so the stale list can stay for reference.
          setLoadError(result.error);
          setListNotice(null);
          return;
        }
        // The listing is capped server-side; keep the truncation metadata so the
        // page can say that older resumes were not returned (工单 09).
        const { resumes: rows, notice } = readResumeList(result.data);
        setResumes(rows);
        setListNotice(notice);
      })
      .catch((err: unknown) => {
        // Reached only if `apiFetch` itself rejected (a transport failure), since `readJsonBody`
        // reports HTTP errors as values rather than throwing.
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '加载简历列表失败，请稍后重试');
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

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/resumes/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setResumes((prev) => prev.filter((r) => r.id !== deleteId));
        addToast('success', '简历已删除');
      } else {
        const data = await res.json().catch(() => ({}));
        addToast('error', data.error || '删除失败');
      }
    } catch {
      addToast('error', '网络错误，请重试');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
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

      {/* Truncation notice: the server caps this listing, so say so rather than
          letting a user conclude their older resumes were deleted. Rendered
          outside the loading branch so it does not blink on every refetch. */}
      <ListLimitNotice
        notice={listNotice}
        message={listNotice ? resumeListNoticeText(listNotice) : undefined}
      />

      {/* Content */}
      {loadingResumes ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" label="加载中..." />
        </div>
      ) : loadError ? (
        /*
         * Checked *before* the empty state. This ordering is the whole fix: a failed request used to
         * fall through to 「还没有简历」, which on a user's own page reads as "我的简历没了". The
         * error is shown with a retry because a transient failure is the common case, and the user
         * needs a way out that is not "reload and hope".
         */
        <div className="rounded-[2rem] border border-danger/30 bg-danger/5 px-6 py-10 text-center">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-danger" />
          <h2 className="mb-1 font-serif text-lg font-semibold text-foreground">
            简历列表加载失败
          </h2>
          <p className="mb-5 text-sm text-default-500">{loadError}</p>
          <Button
            variant="bordered"
            radius="full"
            onClick={() => {
              // Cleared here, on the click that retries, rather than on every run of the fetch
              // effect — the error is only stale because the user asked for another attempt.
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
      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="删除简历"
        message="确定要删除这份简历吗？删除后不可恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        loading={deleting}
      />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>);
}
