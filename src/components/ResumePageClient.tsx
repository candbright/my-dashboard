'use client';

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Code2, FileDown, Loader2, Globe, Lock, ArrowLeft } from 'lucide-react';
import { ResumeDisplay } from './ResumeDisplay';
import { ResumeEditor } from './ResumeEditor';
import { ResumeSourceView } from './ResumeSourceView';
import { usePdfExport } from '@/hooks/usePdfExport';
import Link from 'next/link';
import type { ResumeRecord } from '@/lib/types';
import type { ParsedResume } from '@/lib/resume-parser';
import { apiFetch, getToken } from '@/lib/api-client';

type ViewMode = 'view' | 'edit' | 'source';

interface Permissions {
  can_edit: boolean;
  can_delete: boolean;
  can_view_source: boolean;
  can_export_pdf: boolean;
  can_change_visibility: boolean;
  is_owner: boolean;
  is_admin: boolean;
}

interface ResumePageClientProps {
  resume: ResumeRecord;
  parsed: ParsedResume;
  markdown: string;
  permissions?: Permissions;
}

const defaultPermissions: Permissions = {
  can_edit: false,
  can_delete: false,
  can_view_source: false,
  can_export_pdf: true,
  can_change_visibility: false,
  is_owner: false,
  is_admin: false,
};

export function ResumePageClient({
  resume: initialResume,
  parsed: initialParsed,
  markdown: initialMarkdown,
  permissions: serverPermissions,
}: ResumePageClientProps) {
  const [mode, setMode] = useState<ViewMode>('view');
  const [resume, setResume] = useState(initialResume);
  const [parsed, setParsed] = useState(initialParsed);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [permissions, setPermissions] = useState<Permissions>(serverPermissions ?? defaultPermissions);
  const [changingVisibility, setChangingVisibility] = useState(false);
  const { exportPdf, exporting } = usePdfExport();

  // Re-fetch permissions on client side using the localStorage token.
  // This ensures action buttons appear even when the Server Component's
  // cookie-based auth failed to relay the token.
  useEffect(() => {
    if (!getToken()) return;
    // Skip if server already provided elevated permissions (owner/admin actions)
    if (serverPermissions && (serverPermissions.can_edit || serverPermissions.can_change_visibility)) return;
    apiFetch(`/api/resumes/${initialResume.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.permissions) {
          setPermissions(data.permissions);
        }
      })
      .catch(() => {});
  }, [initialResume.id, serverPermissions]);

  const handleSave = useCallback(async (newMarkdown: string) => {
    const res = await apiFetch(`/api/resumes/${resume.id}`, {
      method: 'PUT',
      body: JSON.stringify({ markdown: newMarkdown }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '保存失败');
    }

    const data = await res.json();
    setResume(data.resume);
    setParsed(data.parsed);
    setMarkdown(data.markdown);
    setMode('view');
  }, [resume.id]);

  const handleExportPdf = useCallback(async () => {
    try {
      await exportPdf(resume, parsed);
    } catch {
      // error logged in hook
    }
  }, [exportPdf, resume, parsed]);

  const handleToggleVisibility = useCallback(async () => {
    const newVisibility = resume.visibility === 'public' ? 'private' : 'public';
    const confirmMsg = newVisibility === 'public'
      ? (permissions.is_admin ? '直接设为公开？' : '申请公开此简历？')
      : '设为私人？';
    if (!confirm(confirmMsg)) return;

    setChangingVisibility(true);
    try {
      const res = await apiFetch(`/api/resumes/${resume.id}`, {
        method: 'PUT',
        body: JSON.stringify({ visibility: newVisibility }),
      });

      if (res.ok) {
        const data = await res.json();
        setResume(data.resume);
      }
    } catch {
      // error silenced
    } finally {
      setChangingVisibility(false);
    }
  }, [resume, permissions.is_admin]);

  const btnClass = "p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors disabled:opacity-50";

  return (
    <div className="relative">
      {mode === 'view' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="fixed top-4 right-4 z-50 flex items-center gap-1.5"
        >
          <Link href="/" className={btnClass} title="返回">
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {permissions.can_export_pdf && (
            <button onClick={handleExportPdf} disabled={exporting} className={btnClass} title="导出 PDF">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            </button>
          )}

          {permissions.can_change_visibility && (
            <button onClick={handleToggleVisibility} disabled={changingVisibility} className={btnClass}
              title={resume.visibility === 'public' ? '设为私人' : (permissions.is_admin ? '设为公开' : '申请公开')}>
              {changingVisibility ? <Loader2 className="w-4 h-4 animate-spin" /> :
                resume.visibility === 'public' ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </button>
          )}

          {permissions.can_edit && (
            <button onClick={() => setMode('edit')} className={btnClass} title="编辑">
              <Pencil className="w-4 h-4" />
            </button>
          )}

          {permissions.can_view_source && (
            <button onClick={() => setMode('source')} className={btnClass} title="源码">
              <Code2 className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {mode === 'view' && (
          <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ResumeDisplay resume={resume} parsed={parsed} />
          </motion.div>
        )}

        {mode === 'edit' && (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ResumeEditor resume={resume} parsed={parsed} onSave={handleSave} onCancel={() => setMode('view')} />
          </motion.div>
        )}

        {mode === 'source' && (
          <motion.div key="source" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ResumeSourceView markdown={markdown} onBack={() => setMode('view')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
