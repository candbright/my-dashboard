'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface PendingResume {
  id: string;
  title: string;
  name: string | null;
  job_title: string | null;
  slug: string;
  summary: string | null;
  user_id: string | null;
  updated_at: string;
}

export default function ApprovalsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [resumes, setResumes] = useState<PendingResume[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/');
      return;
    }

    if (!authLoading && isAdmin) {
      apiFetch('/api/admin/approvals')
        .then((r) => r.json())
        .then((data) => setResumes(data.resumes || []))
        .catch(() => {})
        .finally(() => setLoadingResumes(false));
    }
  }, [authLoading, isAdmin, router]);

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      const res = await apiFetch(`/api/admin/approvals/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'approve' }),
      });
      if (res.ok) {
        setResumes((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      // silent
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    try {
      const res = await apiFetch(`/api/admin/approvals/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reject', reason: rejectReason }),
      });
      if (res.ok) {
        setResumes((prev) => prev.filter((r) => r.id !== id));
        setRejectingId(null);
        setRejectReason('');
      }
    } catch {
      // silent
    } finally {
      setProcessing(null);
    }
  };

  if (authLoading || loadingResumes) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
    >
      <h1 className="text-2xl font-bold tracking-tight mb-1">审核管理</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-8">{resumes.length} 条待审核</p>

      <AnimatePresence mode="popLayout">
        {resumes.length === 0 ? (
          <p className="text-center py-16 text-sm text-[var(--muted-foreground)]">没有待审核的申请</p>
        ) : (
          <div className="space-y-3">
            {resumes.map((resume) => (
              <motion.div
                key={resume.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/resume/${resume.slug}`}
                      className="font-medium text-sm hover:text-[var(--accent)] transition-colors"
                    >
                      {resume.title}
                    </Link>
                    {resume.job_title && (
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{resume.job_title}</p>
                    )}
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      {formatDistanceToNow(new Date(resume.updated_at), { addSuffix: true, locale: zhCN })}
                    </p>
                  </div>

                  {rejectingId === resume.id ? (
                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="拒绝原因（可选）"
                        rows={2}
                        className="px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs
                          focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason(''); }}
                          className="flex-1 px-2 py-1 rounded text-xs border border-[var(--border)] hover:bg-[var(--muted)]"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleReject(resume.id)}
                          disabled={processing === resume.id}
                          className="flex-1 px-2 py-1 rounded text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                        >
                          确认拒绝
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(resume.id)}
                        disabled={processing === resume.id}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        {processing === resume.id ? '...' : '批准'}
                      </button>
                      <button
                        onClick={() => setRejectingId(resume.id)}
                        disabled={processing === resume.id}
                        className="px-3 py-1.5 rounded text-xs font-medium text-red-500 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
