'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ScrollText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardBody,
  Chip,
  EmptyState,
  Input,
  ListLimitNotice,
  Select,
  Spinner,
  Tabs,
  ToastContainer,
  useToast,
} from '@/components/ui';
import { listAdminAuditEvents, listAdminAuthEvents } from '@/lib/api-client';
import {
  outcomeLabel,
  payloadSummary,
  resourceTypeLabel,
  type AuditActionOption,
  type AuditAuthEvent,
  type AuditEvent,
} from '@/lib/audit';
import {
  AUDIT_LIST_DEFAULT_LIMIT,
  auditListNoticeText,
  buildListLimitNotice,
  type ListLimitNotice as ListLimitInfo,
} from '@/lib/list-limit';

type TabKey = 'auth' | 'events';

const OUTCOME_OPTIONS = [
  { value: '', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
  { value: 'denied', label: '拒绝' },
];

function relativeTime(value: string): string {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  return formatDistanceToNow(parsed, { addSuffix: true, locale: zhCN });
}

export default function AdminAuditPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [tab, setTab] = useState<TabKey>('auth');
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [email, setEmail] = useState('');
  const [actorIdDraft, setActorIdDraft] = useState('');
  const [actorId, setActorId] = useState('');
  const [actions, setActions] = useState<AuditActionOption[]>([]);
  const [authEvents, setAuthEvents] = useState<AuditAuthEvent[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [listNotice, setListNotice] = useState<ListLimitInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'auth') {
        const payload = await listAdminAuthEvents({
          action,
          outcome,
          email: email.trim(),
        });
        setAuthEvents((payload.events ?? []) as AuditAuthEvent[]);
        setEvents([]);
        setActions(payload.actions ?? []);
        setListNotice(buildListLimitNotice(payload, payload.events?.length ?? 0, AUDIT_LIST_DEFAULT_LIMIT));
      } else {
        const payload = await listAdminAuditEvents({
          action,
          outcome,
          actorId: actorId.trim(),
        });
        setEvents((payload.events ?? []) as AuditEvent[]);
        setAuthEvents([]);
        setActions(payload.actions ?? []);
        setListNotice(buildListLimitNotice(payload, payload.events?.length ?? 0, AUDIT_LIST_DEFAULT_LIMIT));
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '获取审计事件失败');
    } finally {
      setLoading(false);
    }
  }, [tab, action, outcome, email, actorId, addToast]);

  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin, load]);

  if (authLoading) {
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
        <h1 className="text-2xl font-bold tracking-tight font-serif mb-1">审计日志</h1>
        <p className="text-sm text-default-500 mb-6">认证尝试与敏感操作的只读记录，不可删除或导出。</p>

        <Tabs
          items={[
            { key: 'auth', label: '认证' },
            { key: 'events', label: '操作与变更' },
          ]}
          selectedKey={tab}
          onSelectionChange={(key) => {
            setTab(key as TabKey);
            setAction('');
            setOutcome('');
            setEmailDraft('');
            setEmail('');
            setActorIdDraft('');
            setActorId('');
          }}
          variant="solid"
          className="mb-6"
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Select
            label="动作"
            options={[{ value: '', label: '全部动作' }, ...actions]}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
          <Select
            label="结果"
            options={tab === 'auth' ? OUTCOME_OPTIONS.filter((o) => o.value !== 'denied') : OUTCOME_OPTIONS.filter((o) => o.value !== 'failure')}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
          {tab === 'auth' ? (
            <Input
              label="邮箱"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onBlur={() => setEmail(emailDraft.trim())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEmail(emailDraft.trim());
              }}
              placeholder="精确匹配，回车或失焦后筛选"
            />
          ) : (
            <Input
              label="操作者 ID"
              value={actorIdDraft}
              onChange={(e) => setActorIdDraft(e.target.value)}
              onBlur={() => setActorId(actorIdDraft.trim())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setActorId(actorIdDraft.trim());
              }}
              placeholder="精确匹配，回车或失焦后筛选"
            />
          )}
        </div>

        <ListLimitNotice
          notice={listNotice}
          message={listNotice ? auditListNoticeText(listNotice) : undefined}
        />

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="md" />
          </div>
        ) : tab === 'auth' ? (
          authEvents.length === 0 ? (
            <EmptyState icon={<ScrollText className="w-7 h-7 text-default-400" />} title="暂无认证事件" description="登录、注册尝试会显示在这里。" />
          ) : (
            <div className="space-y-3">
              {authEvents.map((event) => (
                <Card key={event.id} variant="bordered">
                  <CardBody className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{event.actionLabel || event.action}</span>
                      <Chip size="sm" variant="flat" color={event.outcome === 'success' ? 'success' : 'danger'}>
                        {outcomeLabel(event.outcome)}
                      </Chip>
                      <span className="text-xs text-default-400 ml-auto">{relativeTime(event.occurredAt)}</span>
                    </div>
                    <p className="text-sm text-default-500">
                      {event.userUsername || '未识别用户'}
                      {event.email ? ` · ${event.email}` : ''}
                    </p>
                    <p className="text-xs text-default-400">
                      {event.displayIp || '—'}
                      {event.requestId ? ` · ${event.requestId}` : ''}
                    </p>
                  </CardBody>
                </Card>
              ))}
            </div>
          )
        ) : events.length === 0 ? (
          <EmptyState icon={<ScrollText className="w-7 h-7 text-default-400" />} title="暂无操作事件" description="角色、授权、审批、简历与 AI 配置的变更会显示在这里。" />
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
                    <p className="text-xs text-default-400">
                      {event.displayIp || '—'}
                      {event.requestId ? ` · ${event.requestId}` : ''}
                    </p>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </motion.div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}
