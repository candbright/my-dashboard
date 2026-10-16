'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Activity } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardBody,
  Chip,
  EmptyState,
  ListLimitNotice,
  Select,
  Spinner,
  ToastContainer,
  useToast,
} from '@/components/ui';
import { ApiError, listMyAuditEvents } from '@/lib/api-client';
import {
  outcomeLabel,
  payloadSummary,
  resourceTypeLabel,
  type AuditActionOption,
  type AuditEvent,
} from '@/lib/audit';
import {
  AUDIT_LIST_DEFAULT_LIMIT,
  auditListNoticeText,
  buildListLimitNotice,
  type ListLimitNotice as ListLimitInfo,
} from '@/lib/list-limit';

function relativeTime(value: string): string {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  return formatDistanceToNow(parsed, { addSuffix: true, locale: zhCN });
}

export default function ActivityPage() {
  const { user, isGuest, loading: authLoading } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [action, setAction] = useState('');
  const [actions, setActions] = useState<AuditActionOption[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [listNotice, setListNotice] = useState<ListLimitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestBlocked, setGuestBlocked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setGuestBlocked(false);
    try {
      const payload = await listMyAuditEvents({ action });
      setEvents((payload.events ?? []) as AuditEvent[]);
      setActions(payload.actions ?? []);
      setListNotice(buildListLimitNotice(payload, payload.events?.length ?? 0, AUDIT_LIST_DEFAULT_LIMIT));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setGuestBlocked(true);
        setEvents([]);
        setListNotice(null);
      } else {
        addToast('error', err instanceof Error ? err.message : '获取活动失败');
      }
    } finally {
      setLoading(false);
    }
  }, [action, addToast]);

  useEffect(() => {
    if (!authLoading && user && !isGuest) void load();
    if (!authLoading && isGuest) {
      setGuestBlocked(true);
      setLoading(false);
    }
  }, [authLoading, user, isGuest, load]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="md" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight font-serif mb-1">我的活动</h1>
        <p className="text-sm text-default-500 mb-6">你作为操作者或对象出现过的敏感变更。不含登录记录。</p>

        {guestBlocked ? (
          <EmptyState
            icon={<Activity className="w-7 h-7 text-default-400" />}
            title="游客账户无法查看活动"
            description="游客账户是只读体验账号，活动记录不对游客开放。"
          />
        ) : (
          <>
            <div className="mb-6 max-w-sm">
              <Select
                label="动作"
                options={[{ value: '', label: '全部动作' }, ...actions]}
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>

            <ListLimitNotice
              notice={listNotice}
              message={listNotice ? auditListNoticeText(listNotice) : undefined}
            />

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size="md" />
              </div>
            ) : events.length === 0 ? (
              <EmptyState
                icon={<Activity className="w-7 h-7 text-default-400" />}
                title="暂无活动"
                description="资料、简历、审批和 AI 配置的变更会显示在这里。"
              />
            ) : (
              <div className="space-y-3">
                {events.map((event) => {
                  const summary = payloadSummary(event.payload);
                  return (
                    <Card key={event.id} variant="bordered">
                      <CardBody className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{event.actionLabel || event.action}</span>
                          <Chip size="sm" variant="flat" color={event.outcome === 'denied' ? 'danger' : 'success'}>
                            {outcomeLabel(event.outcome)}
                          </Chip>
                          {event.resourceType ? (
                            <Chip size="sm" variant="flat">
                              {resourceTypeLabel(event.resourceType)}
                            </Chip>
                          ) : null}
                          <span className="text-xs text-default-400 ml-auto">{relativeTime(event.occurredAt)}</span>
                        </div>
                        <p className="text-sm text-default-500">
                          操作者 {event.actorUsername || event.actorId || '—'}
                          {event.subjectUsername || event.subjectId ? ` · 对象 ${event.subjectUsername || event.subjectId}` : ''}
                        </p>
                        {summary ? <p className="text-sm text-default-600">{summary}</p> : null}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </motion.div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
