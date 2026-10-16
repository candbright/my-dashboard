'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ListLimitNotice,
  Pressable,
  Spinner,
  Textarea,
  ToastContainer,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { decideApproval, listApprovals } from '@/lib/api-client';
import { APPROVAL_FILTERS, type ApprovalRequestView } from '@/lib/ai-providers';
import {
  approvalListNoticeText,
  buildListLimitNotice,
  APPROVAL_LIST_DEFAULT_LIMIT,
  type ListLimitNotice as ListLimitInfo,
} from '@/lib/list-limit';

/**
 * 审核管理 — the single approvals queue.
 *
 * Every resource type is handled by the same list, narrowed by a filter, rather
 * than by a tab that owns its own endpoint and its own release. That is what
 * makes adding a new approvable resource a backend-only change: the row already
 * carries its own labels and display fields.
 */
export default function ApprovalsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [filter, setFilter] = useState('all');
  const [requests, setRequests] = useState<ApprovalRequestView[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [allTotal, setAllTotal] = useState(0);
  const [listNotice, setListNotice] = useState<ListLimitInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(
    async (filterKey: string) => {
      setLoading(true);
      try {
        const resourceType =
          APPROVAL_FILTERS.find((f) => f.key === filterKey)?.resourceType ?? '';
        const payload = await listApprovals({ resourceType });
        setRequests(payload.requests);
        setCounts(payload.counts);
        setAllTotal(payload.allTotal);
        // The queue is capped server-side and used to report a `total` derived
        // from the already-truncated slice, so a 431-item queue looked like 200
        // (工单 09). Now the server reports the real count and we surface it.
        setListNotice(
          buildListLimitNotice(payload, payload.requests.length, APPROVAL_LIST_DEFAULT_LIMIT)
        );
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : '获取审核列表失败');
      } finally {
        setLoading(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    if (!authLoading && isAdmin) void load(filter);
  }, [authLoading, isAdmin, filter, load]);

  const decide = async (id: string, action: 'approve' | 'reject', reason = '') => {
    setProcessing(id);
    try {
      await decideApproval(id, action, reason);
      // The decision applies the permission server-side, so the row is dropped
      // locally rather than re-fetched: an immediate reload could race the write
      // that was just acknowledged and show the row again.
      const row = requests.find((r) => r.id === id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      if (row) {
        setCounts((prev) => ({
          ...prev,
          [row.resourceType]: Math.max(0, (prev[row.resourceType] ?? 1) - 1),
        }));
      }
      setAllTotal((prev) => Math.max(0, prev - 1));
      setRejectingId(null);
      setRejectReason('');
      addToast('success', action === 'approve' ? '已批准' : '已拒绝');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '操作失败');
    } finally {
      setProcessing(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="md" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight font-serif mb-1">审核管理</h1>
        <p className="text-sm text-default-500 mb-6">{allTotal} 条待处理申请</p>

        <ListLimitNotice
          notice={listNotice}
          message={listNotice ? approvalListNoticeText(listNotice) : undefined}
        />

        <div className="mb-6 flex flex-wrap gap-2">
          {APPROVAL_FILTERS.map((item) => {
            const count = item.resourceType ? counts[item.resourceType] ?? 0 : allTotal;
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onClick={() => setFilter(item.key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-default-100/60 text-default-600 hover:bg-default-100'
                )}
              >
                {item.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px]',
                      active ? 'bg-primary-foreground/20' : 'bg-default-200'
                    )}
                  >
                    {count}
                  </span>
                )}
              </Pressable>
            );
          })}
        </div>

        <AnimatePresence mode="popLayout">
          {requests.length === 0 ? (
            <EmptyState
              title="暂无待审核申请"
              description={
                filter === 'all' ? '所有申请都已处理完毕' : '该类型下没有待处理的申请'
              }
            />
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <motion.div
                  key={request.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card variant="bordered" className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip variant="flat" color="secondary" size="sm">
                            {request.resourceTypeLabel || request.resourceType}
                          </Chip>
                          <Chip variant="flat" color="default" size="sm">
                            {request.permissionLabel || request.permission}
                          </Chip>
                        </div>

                        <div className="mt-2">
                          {request.resourceType === 'resume' ? (
                            request.missing ? (
                              <span className="text-sm text-default-400">简历已删除</span>
                            ) : (
                              <Link
                                href={`/resume/${request.slug ?? ''}`}
                                className="text-sm font-medium transition-colors duration-500 ease-in-out hover:text-primary"
                              >
                                {request.title || request.resourceId}
                              </Link>
                            )
                          ) : (
                            <span className="text-sm font-medium text-foreground">
                              {request.username || request.userId}
                            </span>
                          )}
                        </div>

                        {request.reason && (
                          <p className="mt-1 text-xs text-default-500">
                            申请理由：{request.reason}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-default-400">
                          {request.username} ·{' '}
                          {formatDistanceToNow(new Date(request.createdAt), {
                            addSuffix: true,
                            locale: zhCN,
                          })}
                        </p>
                      </div>

                      {rejectingId === request.id ? (
                        <div className="flex min-w-[200px] flex-col gap-2">
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
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason('');
                              }}
                            >
                              取消
                            </Button>
                            <Button
                              color="danger"
                              size="sm"
                              className="flex-1"
                              onClick={() => decide(request.id, 'reject', rejectReason)}
                              isLoading={processing === request.id}
                            >
                              确认拒绝
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex shrink-0 gap-2">
                          <Button
                            color="success"
                            size="sm"
                            onClick={() => decide(request.id, 'approve')}
                            isLoading={processing === request.id}
                          >
                            批准
                          </Button>
                          <Button
                            color="danger"
                            variant="bordered"
                            size="sm"
                            onClick={() => setRejectingId(request.id)}
                            isDisabled={processing === request.id}
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

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
