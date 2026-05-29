'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Button, Card, Spinner, EmptyState, Textarea } from '@/components/ui';

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
  const [resumes, setResumes] = useState<PendingResume[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      apiFetch('/api/admin/approvals')
        .then((r) => r.json())
        .then((data) => setResumes(data.resumes || []))
        .catch(() => {})
        .finally(() => setLoadingResumes(false));
    }
  }, [authLoading, isAdmin]);

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
        <Spinner size="md" />
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
      <p className="text-sm text-default-500 mb-8">{resumes.length} 条待审核</p>

      <AnimatePresence mode="popLayout">
        {resumes.length === 0 ? (
          <EmptyState title="暂无待审核申请" description="所有简历都已处理完毕" />
        ) : (
          <div className="space-y-3">
            {resumes.map((resume) => (
              <motion.div
                key={resume.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <Card variant="bordered" className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/resume/${resume.slug}`}
                        className="font-medium text-sm hover:text-primary transition-colors"
                      >
                        {resume.title}
                      </Link>
                      {resume.job_title && (
                        <p className="text-xs text-default-500 mt-0.5">{resume.job_title}</p>
                      )}
                      <p className="text-xs text-default-400 mt-1">
                        {formatDistanceToNow(new Date(resume.updated_at), { addSuffix: true, locale: zhCN })}
                      </p>
                    </div>

                    {rejectingId === resume.id ? (
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        <Textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="拒绝原因（可选）"
                          rows={2}
                          variant="bordered"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="bordered"
                            size="sm"
                            className="flex-1"
                            onClick={() => { setRejectingId(null); setRejectReason(''); }}
                          >
                            取消
                          </Button>
                          <Button
                            color="danger"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleReject(resume.id)}
                            isLoading={processing === resume.id}
                          >
                            确认拒绝
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          color="success"
                          size="sm"
                          onClick={() => handleApprove(resume.id)}
                          isLoading={processing === resume.id}
                        >
                          批准
                        </Button>
                        <Button
                          color="danger"
                          variant="bordered"
                          size="sm"
                          onClick={() => setRejectingId(resume.id)}
                          isDisabled={processing === resume.id}
                        >
                          拒绝
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
