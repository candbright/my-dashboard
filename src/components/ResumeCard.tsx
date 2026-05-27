'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Trash2, Globe, Lock, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface ResumeCardProps {
  id: string;
  title: string;
  slug: string;
  jobTitle?: string | null;
  location?: string | null;
  summary?: string | null;
  createdAt: string;
  visibility?: string;
  approvalStatus?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}

function statusLabel(visibility?: string, approvalStatus?: string) {
  if (!visibility) return null;
  if (visibility === 'private') return { text: '私人', cls: 'text-gray-500' };
  switch (approvalStatus) {
    case 'pending': return { text: '审核中', cls: 'text-amber-500' };
    case 'approved': return { text: '公开', cls: 'text-green-500' };
    case 'rejected': return { text: '已拒绝', cls: 'text-red-500' };
    default: return { text: '草稿', cls: 'text-gray-500' };
  }
}

export function ResumeCard({
  id,
  title,
  slug,
  jobTitle,
  summary,
  createdAt,
  visibility,
  approvalStatus,
  isOwner,
  isAdmin,
  onDelete,
}: ResumeCardProps) {
  const status = (isOwner || isAdmin) ? statusLabel(visibility, approvalStatus) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="group bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--accent)] hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-2">
        <Link href={`/resume/${slug}`} className="flex-1 min-w-0">
          <h3 className="text-base font-semibold tracking-tight line-clamp-1 hover:text-[var(--accent)] transition-colors">
            {title}
          </h3>
        </Link>
        {onDelete && (
          <button
            onClick={() => onDelete(id)}
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all ml-2"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        )}
      </div>

      {jobTitle && (
        <p className="text-sm text-[var(--muted-foreground)] mb-1">{jobTitle}</p>
      )}

      {summary && (
        <p className="text-xs text-[var(--muted-foreground)] line-clamp-2 mb-3">{summary}</p>
      )}

      <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
        <span>{formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: zhCN })}</span>
        {status && <span className={status.cls}>{status.text}</span>}
      </div>
    </motion.div>
  );
}
