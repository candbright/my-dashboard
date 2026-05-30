'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Chip, Card, CardBody, Button } from '@/components/ui';
import type { ChipProps } from '@/components/ui/Chip';

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

function statusLabel(
  visibility?: string,
  approvalStatus?: string
): { text: string; color: ChipProps['color']; variant: ChipProps['variant'] } | null {
  if (!visibility) return null;
  if (visibility === 'private')
    return { text: '私人', color: 'default', variant: 'dot' };
  switch (approvalStatus) {
    case 'pending':
      return { text: '审核中', color: 'warning', variant: 'dot' };
    case 'approved':
      return { text: '公开', color: 'success', variant: 'dot' };
    case 'rejected':
      return { text: '已拒绝', color: 'danger', variant: 'dot' };
    default:
      return { text: '草稿', color: 'default', variant: 'dot' };
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
  const status =
    isOwner || isAdmin ? statusLabel(visibility, approvalStatus) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="group"
    >
      <Card isHoverable className="h-full">
        <CardBody className="p-5">
          <div className="flex items-start justify-between mb-2">
            <Link href={`/resume/${slug}`} className="flex-1 min-w-0">
              <h3 className="text-base font-semibold tracking-tight line-clamp-1 text-foreground hover:text-primary transition-colors">
                {title}
              </h3>
            </Link>
            {onDelete && (
              <Button
                variant="light"
                color="danger"
                isIconOnly
                size="sm"
                className="opacity-0 group-hover:opacity-100 ml-2"
                onClick={() => onDelete(id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {jobTitle && (
            <p className="text-sm text-default-500 mb-1">{jobTitle}</p>
          )}

          {summary && (
            <p className="text-xs text-default-400 line-clamp-2 mb-3">
              {summary}
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-default-400">
              {formatDistanceToNow(new Date(createdAt), {
                addSuffix: true,
                locale: zhCN,
              })}
            </span>
            {status && (
              <Chip color={status.color} variant={status.variant} size="sm">
                {status.text}
              </Chip>
            )}
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}
