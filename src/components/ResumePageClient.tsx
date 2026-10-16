'use client';

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Code2, FileDown, FileText, ImageDown, Loader2, Globe, Lock, ArrowLeft, Save, LayoutTemplate, Eye, ScanSearch, History } from 'lucide-react';
import { ResumeDisplay } from './ResumeDisplay';
import { ResumeEditor } from './ResumeEditor';
import { ResumeSourceView } from './ResumeSourceView';
import { ResumePrintView } from './ResumePrintView';
import { ResumeHistoryPanel } from './ResumeHistoryPanel';
import { AtsPreview } from './AtsPreview';
import { usePdfExport } from '@/hooks/usePdfExport';
import { ConfirmModal, useToast, ToastContainer } from '@/components/ui';
import Link from 'next/link';
import type { ResumeRecord } from '@/lib/types';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';
import {
  parseResumeMarkdown,
  parsedFromStructuredContent,
  resumeMetadataView,
  withMetadata,
} from '@/lib/resume-parser';
import type { StructuredContent } from '@/lib/resume-model';
import { apiFetch, getToken } from '@/lib/api-client';
import { downloadBlob } from '@/lib/export-pdf';
import { resumeTextBlob, resumeTextFileName } from '@/lib/resume-text';
import {
  saveResume,
  saveResumeMetadata,
  fetchResumeDetail,
  ResumeConflictError,
  type SaveResumeResult,
} from '@/lib/resume-api';
import {
  METADATA_FIELDS,
  metadataValuesFromRecord,
  type MetadataKey,
  type ResumeMetadataPatch,
  type ResumeMetadataValues,
} from '@/lib/resume-metadata';
import type { VersionConflict } from '@/lib/version-conflict';
import { resumeWithPresentation } from '@/lib/resume-presentation';
import { ConflictNotice } from './ConflictNotice';
import { AutosaveIndicator } from './AutosaveIndicator';
import { useResumeAutosave } from '@/hooks/useResumeAutosave';
import { useAuth } from '@/contexts/AuthContext';

type ViewMode = 'view' | 'edit' | 'source' | 'ats' | 'history';
type ViewStyle = 'parsed' | 'template';

/**
 * Styling for one button in the floating action bar.
 *
 * Also used directly by the `<Link>` in that bar: `ui/Button` has no `as` prop (see
 * `AGENTS.md`), so the navigation target has to stay an anchor, and sharing the class
 * string is the only way to keep it visually identical to its neighbours.
 */
const toolbarButtonClass =
  'p-2 rounded-full bg-content1 border border-default-200 hover:border-primary transition-colors duration-500 ease-in-out disabled:opacity-50 inline-flex items-center justify-center';

/**
 * One button in the resume action bar.
 *
 * `ui/Button` is deliberately not used here even though AGENTS.md asks for it: its
 * `bordered` variant hard-codes `border-2` and it has no way to express "square
 * padding, no height class", so going through it would change the bar's layout and
 * reintroduce `border-2` (which AGENTS.md separately bans). This helper at least
 * keeps the six-plus buttons in the bar defined once instead of six times, which was
 * the real problem — they had drifted apart (ticket 08).
 */
function ToolbarButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={toolbarButtonClass} {...props}>
      {children}
    </button>
  );
}

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
  /**
   * Metadata-normalised by the server component before it gets here, and re-normalised
   * after every save below. Anything that renders or exports the resume depends on the
   * frontmatter being the metadata view rather than the document's (empty) frontmatter.
   */
  parsed: ParsedResumeWithMetadata;
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

/**
 * The optimistic-lock token to send with the next write.
 *
 * Returns `0` when the resume carries no version, which is what a payload cached before
 * ticket 12 looks like. Sending 0 makes the server refuse with `VERSION_MISSING` and an
 * explanation the user can act on. Omitting the field would be indistinguishable from 0
 * on the wire — proto3 has no presence for a plain scalar — so being explicit keeps the
 * request honest about what it actually knows.
 */
function resumeVersion(resume: ResumeRecord): number {
  return typeof resume.version === 'number' && Number.isFinite(resume.version)
    ? resume.version
    : 0;
}

/**
 * Parse a document the server just returned, with its metadata attached.
 *
 * # Why this parses rather than reading a `parsed` field
 *
 * `SaveResumeResult` in `resume-api.ts` declares a `parsed` field, and the code here used
 * to read it — but **the backend has never sent one**. `buildResumeDetail` answers with
 * `resume`, `markdown` and `permissions` only, and no reply type has a parsed field. So
 * `data.parsed` was `undefined` at runtime and the preview was set to `undefined` after
 * every save and conflict reload, which the `ResumeDisplay` render would have hit as soon
 * as the mode switched back to view.
 *
 * TypeScript could not see it because `resume-api.ts` casts the response body to
 * `SaveResumeResult`. The cast asserted a field into existence, so the type checker
 * confirmed the code agreed with itself rather than with the server.
 *
 * # Where the structure comes from now (ticket 18)
 *
 * `GET /api/resumes/{id}` returns a server-parsed `content` snapshot, and that is the
 * authority (ADR-0003): the client uses it rather than forming its own opinion about a
 * document the server has already read. The client parser is reached only when the field is
 * **absent**, which means a deployment predating ticket 18 — `PUT` (save) and `PATCH`
 * (metadata) still answer with `markdown` alone, so those paths keep parsing locally. That
 * is the intended degradation, not a silent fallback: an absent field and an empty snapshot
 * are different answers, and only the absent one re-parses.
 *
 * Re-parsing rather than re-fetching the page after a save is still deliberate — the
 * response already carries the new document, and a full navigation would be worse.
 */
function clientParsed(data: {
  markdown: string;
  resume: ResumeRecord;
  content?: StructuredContent;
}): ParsedResumeWithMetadata {
  return data.content !== undefined
    ? parsedFromStructuredContent(data.content, data.resume, undefined, data.markdown)
    : withMetadata(parseResumeMarkdown(data.markdown), data.resume);
}

/**
 * Map a rejected metadata message onto the field it is about, so the input can be marked.
 *
 * The server's messages are specific but unlabelled — `邮箱格式不正确，示例：name@example.com`,
 * `不支持的字段：job_titel`. Showing one as a general banner above a ten-field form leaves the
 * user to work out which field it refers to; marking the input is what makes it actionable.
 *
 * Two matchings, in order:
 *
 *  1. The field's **name**, for the unknown-field error, which is the only message that
 *     necessarily contains a key.
 *  2. The field's **label**, for a format error. The server writes 「邮箱格式不正确」 and this
 *     form labels that field 「邮箱」, so the label appears verbatim in the message. Matching on
 *     the shipped labels is exactly what would break if the two vocabularies drifted, which is
 *     why the labels live in one exported list rather than being written out twice.
 *
 * Returns `{}` when nothing matches: an unattributed message stays in the banner, which is
 * better than marking the wrong field.
 */
function attributeServerError(message: string): Partial<Record<MetadataKey, string>> {
  for (const field of METADATA_FIELDS) {
    if (message.includes(field.key)) return { [field.key]: message };
  }
  for (const field of METADATA_FIELDS) {
    if (message.includes(field.label)) return { [field.key]: message };
  }
  return {};
}

export function ResumePageClient({
  resume: initialResume,
  parsed: initialParsed,
  markdown: initialMarkdown,
  permissions: serverPermissions,
}: ResumePageClientProps) {
  const [mode, setMode] = useState<ViewMode>('view');
  const [resume, setResume] = useState(initialResume);
  const [parsed, setParsed] = useState<ParsedResumeWithMetadata>(initialParsed);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [permissions, setPermissions] = useState<Permissions>(serverPermissions ?? defaultPermissions);
  const [changingVisibility, setChangingVisibility] = useState(false);
  const [editMarkdown, setEditMarkdown] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [viewStyle, setViewStyle] = useState<ViewStyle>('parsed');
  const [conflict, setConflict] = useState<VersionConflict | null>(null);
  const [conflictReloading, setConflictReloading] = useState(false);
  const [showVisibilityConfirm, setShowVisibilityConfirm] = useState(false);
  const [visibilityTarget, setVisibilityTarget] = useState<'public' | 'private' | null>(null);
  // Metadata form state (ticket 15). Lifted here rather than kept inside the editor for one
  // reason: the patch has to be sent with the `version` the page holds. The editor has no
  // access to it, and a second read of the record inside the editor would race the
  // `setResume` that a concurrent autosave schedules.
  const [metadataValues, setMetadataValues] = useState<ResumeMetadataValues>(() =>
    metadataValuesFromRecord(initialResume)
  );
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataErrors, setMetadataErrors] = useState<
    Partial<Record<MetadataKey, string>>
  >({});
  const [metadataErrorMessage, setMetadataErrorMessage] = useState<string | null>(null);
  const [metadataSuccessMessage, setMetadataSuccessMessage] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToast();
  const { exportPdf, exporting, exportImage, exportingImage, hint } = usePdfExport();
  // Safe unconditionally: the root layout wraps every route in `AuthProvider`, so this
  // hook's "must be used within an AuthProvider" throw cannot fire on the public page.
  const { isGuest } = useAuth();

  /**
   * Set when the permission re-fetch failed, so the toolbar can say why the editing controls are
   * missing instead of just not rendering them.
   *
   * The `.catch(() => {})` this replaces produced a silent downgrade: a logged-in owner whose
   * request failed saw a read-only page with no Edit button and **no reason given**. From the user's
   * side that is indistinguishable from "I have lost access to my own resume", and there was nothing
   * to click to try again. The failure is now stated and retryable.
   *
   * Note this only ever *reports* a problem — it never grants a permission the server did not send.
   * `can_edit` still comes from `permissions`, which remains the single source of truth (ADR-0009).
   */
  const [permissionsFailed, setPermissionsFailed] = useState(false);
  /** Bumped by the retry control to re-run the permission effect. */
  const [permissionsRetryKey, setPermissionsRetryKey] = useState(0);

  // Re-fetch permissions on client side using the localStorage token.
  // This ensures action buttons appear even when the Server Component's
  // cookie-based auth failed to relay the token.
  useEffect(() => {
    if (!getToken()) return;
    // Skip if server already provided elevated permissions (owner/admin actions)
    if (serverPermissions && (serverPermissions.can_edit || serverPermissions.can_change_visibility)) return;
    setPermissionsFailed(false);
    apiFetch(`/api/resumes/${initialResume.id}`)
      .then(async (res) => {
        // A non-2xx answer carries no permissions, so it must be reported rather than treated as
        // "no permissions". Previously both collapsed to `null` and the failure was dropped.
        if (!res.ok) {
          throw new Error(`权限加载失败（HTTP ${res.status}）`);
        }
        return res.json();
      })
      .then((data) => {
        if (data?.permissions) {
          setPermissions(data.permissions);
        }
      })
      .catch(() => {
        setPermissionsFailed(true);
      });
  }, [initialResume.id, serverPermissions, permissionsRetryKey]);

  /**
   * Adopt a record that came back from a write.
   *
   * Every write path answers with the same triple — the row, the document, and the server's
   * parse of it — and the three describe one version, so they move together. When they do
   * not, the page shows one version's number beside another version's text.
   *
   * Four call sites spelled this out by hand (A8) and two more updated only the row. The
   * metadata path is the one that proves it was drift rather than a decision: the server
   * returns `content` on that route *specifically* so the parse will not go stale, and the
   * client threw it away. Which fields follow a record is a property of the record, so it is
   * decided here, once.
   */
  const applyServerRecord = useCallback((data: SaveResumeResult) => {
    // The record is folded with the reply's styling, and a reply that carries none keeps the one on
    // screen: `PUT` answers `{resume, markdown, content}` and no presentation (ADR-0004 puts styling
    // beside the record), so replacing wholesale made a saved 绿野通栏 resume snap back to the default
    // template on every content save. Only `PATCH /presentation`, the restore path and a fresh read
    // carry a presentation, and those are exactly the cases where the reply's must win.
    setResume((current) => resumeWithPresentation(data.resume, data.presentation ?? current.presentation));
    setParsed(clientParsed(data));
    setMarkdown(data.markdown);
    // A successful write also means the version lock is satisfied again, so any conflict
    // notice on screen describes a state that no longer exists.
    setConflict(null);
  }, []);

  const handleSave = useCallback(
    async (newMarkdown: string) => {
      try {
        const data = await saveResume(resume.id, {
          markdown: newMarkdown,
          version: resumeVersion(resume),
        });
        applyServerRecord(data);
        setMode('view');
      } catch (err) {
        if (err instanceof ResumeConflictError) {
          // A conflict is not a failed save to retry — it is the server refusing to
          // discard somebody else's work. The draft must survive, so this re-throws to
          // keep the editor open and records the notice for it to render.
          setConflict(err.conflict);
        }
        throw err;
      }
    },
    [resume, applyServerRecord]
  );

  /**
   * The autosave write path.
   *
   * Deliberately **not** `handleSave`, for two reasons that are easy to miss:
   *
   * 1. `handleSave` ends with `setMode('view')`. That is right for the explicit save
   *    button — the user is done — and catastrophic for autosave, which would eject them
   *    from the editor roughly two seconds after they stopped typing.
   * 2. It must resolve to the version rather than returning void, because the autosave
   *    hook has to know which token to use next. Re-reading `resume` from state would race
   *    the `setResume` that this same call schedules.
   *
   * It still updates the page's copy of the record, so switching to the preview tab after
   * an autosave shows what was saved rather than the stale initial fetch.
   */
  const autosavePersist = useCallback(
    async (newMarkdown: string): Promise<{ version: number }> => {
      const data = await saveResume(resume.id, {
        markdown: newMarkdown,
        version: resumeVersion(resume),
      });
      applyServerRecord(data);
      return { version: resumeVersion(data.resume) };
    },
    [resume, applyServerRecord]
  );

  /**
   * Persist a metadata patch (ticket 15).
   *
   * # Why the version comes from `resume` here and not from a parameter
   *
   * Metadata and content share one `version` column (ADR-0010). The editor holds a *draft*
   * of the body, not the row's token, so the token has to be read from the page's own record
   * — the same one `autosavePersist` and `confirmVisibility` use. Reading it here rather than
   * inside the editor also keeps one writer of `resume`: the editor would have to duplicate
   * the `setResume`/`setConflict` bookkeeping.
   *
   * # Conflict handling
   *
   * A conflict is surfaced as a notice like every other write path, and the error is
   * **re-thrown** so the panel can stop showing its spinner. The fields keep their values:
   * the user's edits are in state, and throwing them away would make the conflict look like a
   * failed edit rather than a decision they have to make.
   *
   * # Success
   *
   * The merged record is written back to `resume`, which advances the page's version. That
   * matters immediately: without it the **next** content autosave would send a stale token
   * and be refused, so editing metadata would appear to break saving until a reload.
   */
  /**
   * Apply the result of a rollback (ticket 16).
   *
   * # Why this does not just refresh in place
   *
   * A rollback is an ordinary accepted save, so what comes back is a new record with an
   * advanced `version`, plus the restored document. Writing all three back is what keeps the
   * page consistent: without the `version` update the **next** autosave would send a stale
   * token and be refused, which would make rolling back look like it had broken saving —
   * exactly the trap the metadata path documents.
   *
   * The panel stays open on purpose. The user just rewound the document; leaving them in the
   * history view lets them read the result of their own action, and the freshly appended
   * revision appears at the top of the list.
   */
  const handleRestored = useCallback((data: SaveResumeResult) => {
    applyServerRecord(data);
    // The restored revision is a *new* version, so naming it is the one fact that tells the
    // user the rollback appended rather than rewound — which is what makes it undoable.
    addToast('success', `已恢复旧版内容，并保存为第 ${resumeVersion(data.resume)} 版`);
  }, [addToast, applyServerRecord]);

  const handleSaveMetadata = useCallback(
    async (patch: ResumeMetadataPatch, _signal: AbortSignal) => {
      // `_signal` is accepted to honour the panel's contract and is unused on purpose:
      // `apiFetch` does not thread a signal through to `fetch`, and the panel's own unmount
      // guard already stops it from reading a late response. Threading one would change
      // `apiFetch` for every caller in the app, which is not this ticket's business. Named
      // with an underscore so the intent is visible rather than looking like an oversight.
      setMetadataSaving(true);
      setMetadataErrorMessage(null);
      setMetadataErrors({});
      try {
        const data = await saveResumeMetadata(resume.id, {
          version: resumeVersion(resume),
          metadata: patch,
        });
        applyServerRecord(data);
        // The form re-reads from the record, so a normalised server value (a trimmed phone,
        // say) replaces what the user typed instead of the two disagreeing.
        setMetadataValues(metadataValuesFromRecord(data.resume));
        setMetadataSuccessMessage('基本信息已保存');
      } catch (err) {
        if (err instanceof ResumeConflictError) {
          setConflict(err.conflict);
          setMetadataErrorMessage(err.message);
        } else {
          const message = err instanceof Error ? err.message : '保存基本信息失败';
          setMetadataErrorMessage(message);
          // A rejected field message names its field (`不支持的字段：x`, `邮箱格式不正确`).
          // Marking the input is what makes the message actionable, so the mapping is done
          // here where the message is in hand.
          setMetadataErrors(attributeServerError(message));
        }
        // Re-thrown so the panel knows the save failed and clears its in-flight state. The
        // panel does not display this: the messages above are already on screen.
        throw err;
      } finally {
        setMetadataSaving(false);
      }
    },
    [resume, applyServerRecord]
  );

  /** Clear the success message as soon as the user edits again. */
  const handleMetadataChange = useCallback((key: MetadataKey, value: string) => {
    setMetadataValues((prev) => ({ ...prev, [key]: value }));
    // A stale "已保存" next to unsaved text is a lie, so it goes on the first keystroke.
    setMetadataSuccessMessage(null);
    // And the server's error for this field is about the value that was rejected, not the
    // one being typed, so it is cleared rather than left to mislead.
    setMetadataErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMetadataErrorMessage(null);
  }, []);

  /**
   * Autosave is off for anyone who cannot edit, and for a guest account.
   *
   * Both halves matter. `can_edit` is false for a visitor looking at somebody's public
   * resume, and the server would refuse the write — so attempting it is a request
   * guaranteed to fail, which the ticket explicitly calls out. `isGuest` is checked
   * separately because the demo account is read-only by policy rather than by permission
   * and must not generate traffic.
   *
   * Named rather than inlined so the hook's switch and the indicator's visibility are the
   * same expression: an indicator shown while autosave is off would promise a save that
   * will never happen.
   */
  const autosaveEnabled = mode === 'edit' && permissions.can_edit && !isGuest;

  const autosave = useResumeAutosave({
    markdown: editMarkdown,
    save: autosavePersist,
    enabled: autosaveEnabled,
    // A conflict notice is on screen; the user has to choose before anything is written.
    suspended: conflict !== null,
    // Autosave has no button behind it, so a failure it cannot retry away has to be reported
    // here or the user never learns about it. Every other write path reports through a toast
    // or the conflict notice; this one reported nowhere until this callback was wired.
    onError: (err) => {
      if (err instanceof ResumeConflictError) {
        // The same notice and reload flow the other write paths use. Without it the panel only
        // offered a retry, which could do nothing but hit the same lock again.
        setConflict(err.conflict);
        return;
      }
      addToast('error', err instanceof Error ? err.message : '保存失败');
    },
  });

  const handleExportPdf = useCallback(async () => {
    try {
      await exportPdf(resume, parsed);
      // The browser owns the "Save as PDF" step, so tell the user what to pick in
      // the dialog — otherwise this reads as "nothing happened".
      addToast('success', hint);
    } catch (err) {
      // Previously this swallowed the error entirely, so a failed export did
      // nothing at all from the user's point of view.
      addToast('error', err instanceof Error ? err.message : '导出 PDF 失败');
    }
  }, [exportPdf, resume, parsed, addToast, hint]);

  const handleExportImage = useCallback(async () => {
    try {
      await exportImage(resume, parsed);
      addToast('success', '图片已开始下载');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '导出图片失败');
    }
  }, [exportImage, resume, parsed, addToast]);

  const handleExportText = useCallback(() => {
    // No async work and no dialog: the bytes are pure and the download is immediate.
    // Shown to anyone who may read the source, because that is the same content.
    try {
      downloadBlob(resumeTextBlob(parsed), resumeTextFileName(parsed.frontmatter, resume.title));
      addToast('success', '纯文本已下载，招聘系统可直接读取');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '导出纯文本失败');
    }
  }, [parsed, resume.title, addToast]);

  const handleToggleVisibility = useCallback(() => {
    const newVisibility = resume.visibility === 'public' ? 'private' : 'public';
    setVisibilityTarget(newVisibility);
    setShowVisibilityConfirm(true);
  }, [resume.visibility]);

  const confirmVisibility = useCallback(async () => {
    if (!visibilityTarget) return;
    setShowVisibilityConfirm(false);
    setChangingVisibility(true);
    // Clear any previous conflict: this request re-reads the version it is about to
    // assert, so a stale one from an earlier refused save must not linger.
    setConflict(null);
    try {
      const data = await saveResume(resume.id, {
        visibility: visibilityTarget,
        version: resumeVersion(resume),
      });
      applyServerRecord(data);
      addToast('success', visibilityTarget === 'public' ? '简历已公开' : '简历已设为私人');
    } catch (err) {
      if (err instanceof ResumeConflictError) {
        // The resume moved while the confirmation dialog was open. Say so, and pull
        // the current state so the button reflects reality instead of the stale value
        // the user just acted on.
        addToast('error', err.message);
        setConflict(err.conflict);
      } else {
        addToast('error', err instanceof Error ? err.message : '操作失败');
      }
    } finally {
      setChangingVisibility(false);
      setVisibilityTarget(null);
    }
  }, [visibilityTarget, resume, addToast, applyServerRecord]);

  /**
   * Accept the server's version after a conflict, keeping the user's draft.
   *
   * This is the "reload" half of the conflict flow. The edit buffer is deliberately
   * left alone: refreshing the preview is what lets the user see what they are about
   * to overwrite, but the document they typed is the only copy of it and must not be
   * replaced by the server's.
   */
  const handleReloadAfterConflict = useCallback(async () => {
    setConflictReloading(true);
    try {
      const data = await fetchResumeDetail(resume.id);
      applyServerRecord(data);
      // The metadata form must reload too (ticket 15). Its fields are part of the same row,
      // and after a conflict the values on screen are the ones that lost — leaving them would
      // invite the user to press save again and lose the same race a second time.
      setMetadataValues(metadataValuesFromRecord(data.resume));
      setMetadataErrorMessage(null);
      setMetadataErrors({});
      addToast('success', '已载入服务端最新内容，你的修改仍在编辑框中');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : '刷新失败');
    } finally {
      setConflictReloading(false);
    }
  }, [resume.id, addToast, applyServerRecord]);

  /**
   * Saves the editor's buffer.
   *
   * Two save buttons reach `handleSave` — this one in the toolbar and the editor's own —
   * and both must report a failure. A conflict is already rendered as a persistent
   * notice by `handleSave`, so it is not repeated as a toast; anything else (permissions,
   * network, a missing row) has no other channel and gets one.
   */
  const handleEditSave = useCallback(async () => {
    if (!editMarkdown || editSaving) return;
    setEditSaving(true);
    try {
      await handleSave(editMarkdown);
    } catch (err) {
      if (!(err instanceof ResumeConflictError)) {
        addToast('error', err instanceof Error ? err.message : '保存失败');
      }
    } finally {
      setEditSaving(false);
    }
  }, [editMarkdown, editSaving, handleSave, addToast]);

  return (
    <>
    <div className="relative">
      {/* Floating top-right nav bar */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: mode === 'edit' ? 0.1 : 0.5, duration: 0.3 }}
        className="fixed top-20 right-6 z-50"
      >
        <div className="bg-content1/95 backdrop-blur-md rounded-[2rem] px-4 py-2.5 flex items-center gap-1.5 border border-default-200">
          {/* ── Edit mode: save + back ── */}
          {mode === 'edit' && (
            <>
              <ToolbarButton onClick={handleEditSave} disabled={editSaving} title="保存">
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </ToolbarButton>
              <ToolbarButton onClick={() => setMode('view')} title="返回预览">
                <ArrowLeft className="w-4 h-4" />
              </ToolbarButton>
            </>
          )}

          {/* ── Source / ATS mode: back ── */}
          {(mode === 'source' || mode === 'ats') && (
            <ToolbarButton onClick={() => setMode('view')} title="返回预览">
              <ArrowLeft className="w-4 h-4" />
            </ToolbarButton>
          )}

          {/* ── View mode ── */}
          {mode === 'view' && (
            <>
              {/* View style toggle */}
              <ToolbarButton
                onClick={() => setViewStyle(viewStyle === 'parsed' ? 'template' : 'parsed')}
                title={viewStyle === 'parsed' ? '切换到模板视图' : '切换到解析视图'}
              >
                {viewStyle === 'parsed' ? <LayoutTemplate className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </ToolbarButton>

              {permissions.can_export_pdf && (
                <ToolbarButton
                  onClick={handleExportPdf}
                  disabled={exporting}
                  title="导出 PDF（招聘系统可读取）"
                >
                  {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                </ToolbarButton>
              )}

              {permissions.can_view_source && (
                <ToolbarButton
                  onClick={handleExportText}
                  title="导出纯文本（.txt，招聘系统解析最稳，无中文字体问题）"
                >
                  <FileText className="w-4 h-4" />
                </ToolbarButton>
              )}

              {permissions.can_export_pdf && (
                <ToolbarButton
                  onClick={handleExportImage}
                  disabled={exportingImage}
                  title="导出图片（PNG，无文字层，适合聊天发送）"
                >
                  {exportingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
                </ToolbarButton>
              )}

              {permissions.can_view_source && (
                <ToolbarButton
                  onClick={() => setMode('ats')}
                  title="ATS 体检（招聘系统读到了什么）"
                >
                  <ScanSearch className="w-4 h-4" />
                </ToolbarButton>
              )}

              {permissions.can_change_visibility && (
                <ToolbarButton
                  onClick={handleToggleVisibility}
                  disabled={changingVisibility}
                  title={resume.visibility === 'public' ? '设为私人' : (permissions.is_admin ? '设为公开' : '申请公开')}
                >
                  {changingVisibility ? <Loader2 className="w-4 h-4 animate-spin" /> :
                    resume.visibility === 'public' ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                </ToolbarButton>
              )}

              {permissions.can_edit && (
                <ToolbarButton onClick={() => setMode('edit')} title="编辑">
                  <Pencil className="w-4 h-4" />
                </ToolbarButton>
              )}

              {/* History follows the resume's existing rule — owner or admin — which is
                  exactly `can_edit`. ADR-0010 forbids a new permission type for it
                  (ADR-0009: `Known()` is a closed set), so there is no `can_view_history`
                  to check and inventing one here would be the thing the ADR rules out. */}
              {permissions.can_edit && (
                <ToolbarButton onClick={() => setMode('history')} title="版本历史">
                  <History className="w-4 h-4" />
                </ToolbarButton>
              )}

              {permissions.can_view_source && (
                <ToolbarButton onClick={() => setMode('source')} title="源码">
                  <Code2 className="w-4 h-4" />
                </ToolbarButton>
              )}

              {/* A `<Link>` rather than a `ToolbarButton`: `ui/Button` has no `as`
                  prop (see AGENTS.md), so a navigation target has to stay an anchor.
                  It reuses the same class string, which is why `toolbarButtonClass` is
                  exported from the helper below. */}
              <Link href="/my" className={toolbarButtonClass} title="返回我的简历">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </>
          )}
        </div>
      </motion.div>

      {/*
        Says why the editing controls are absent. A silent downgrade reads as "I have lost access to
        my own resume", and there was previously nothing to act on. This states the cause and offers
        the retry; it deliberately does not enable anything the server did not authorise.
      */}
      {permissionsFailed && !permissions.can_edit && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-warning/40 bg-warning/5 px-5 py-3"
        >
          <p className="text-sm text-default-600">
            权限信息加载失败，编辑按钮暂时不可用。这不代表你没有权限，可以重试。
          </p>
          <button
            type="button"
            onClick={() => setPermissionsRetryKey((n) => n + 1)}
            className="rounded-full border border-default-200 px-4 py-1.5 text-sm text-foreground transition-colors duration-500 ease-in-out hover:bg-default-100"
          >
            重试
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {mode === 'view' && (
          <motion.div key={`view-${viewStyle}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {viewStyle === 'parsed' ? (
              <ResumeDisplay resume={resume} parsed={parsed} hideBackButton />
            ) : (
              <div className="flex justify-center py-12 px-4">
                <div className="rounded-lg overflow-hidden border border-default-200">
                  <ResumePrintView resume={resume} parsed={parsed} />
                </div>
              </div>
            )}
          </motion.div>
        )}

        {mode === 'edit' && (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {conflict && (
              <ConflictNotice
                conflict={conflict}
                reloading={conflictReloading}
                onReload={handleReloadAfterConflict}
                onDismiss={() => setConflict(null)}
              />
            )}
            {/*
              The status line sits directly above the editor, next to the document it is
              describing. It is rendered only when autosave is running: for a read-only
              visitor there is nothing to report, and an idle "尚未修改" would suggest
              saving is possible.
            */}
            {autosaveEnabled && (
              <div className="mb-3 flex justify-end">
                <AutosaveIndicator
                  status={autosave.status}
                  lastSavedAt={autosave.lastSavedAt}
                  error={autosave.error}
                  retrying={autosave.retrying}
                  onRetry={autosave.retry}
                />
              </div>
            )}
            <ResumeEditor resume={resume} parsed={parsed} onSave={handleSave} onCancel={() => setMode('view')} enableAI={true}
              hideBottomBar hideHeader onContentChange={setEditMarkdown} onFlush={autosave.saveNow}
              onSaveMetadata={handleSaveMetadata}
              metadataValues={metadataValues}
              onMetadataChange={handleMetadataChange}
              metadataErrors={metadataErrors}
              metadataErrorMessage={metadataErrorMessage}
              metadataSuccessMessage={metadataSuccessMessage}
              metadataSaving={metadataSaving} />
          </motion.div>
        )}

        {mode === 'source' && (
          <motion.div key="source" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ResumeSourceView
              markdown={markdown}
              metadata={resumeMetadataView(resume)}
              onBack={() => setMode('view')}
            />
          </motion.div>
        )}

        {mode === 'ats' && (
          <motion.div key="ats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AtsPreview source={parsed} />
          </motion.div>
        )}

        {mode === 'history' && (
          <ResumeHistoryPanel
            // Keyed by the version so that a rollback — which advances the version without
            // unmounting this panel — remounts it. That is what makes the new revision appear
            // at the top of the list and the "当前" chip move, instead of the panel showing a
            // list that no longer matches the record behind it.
            key={`history-${resumeVersion(resume)}`}
            resumeId={resume.id}
            currentVersion={resumeVersion(resume)}
            canEdit={permissions.can_edit}
            onRestored={handleRestored}
            onBack={() => setMode('view')}
          />
        )}
      </AnimatePresence>
    </div>
    <ConfirmModal
      open={showVisibilityConfirm}
      onClose={() => setShowVisibilityConfirm(false)}
      onConfirm={confirmVisibility}
      title={visibilityTarget === 'public' ? (permissions.is_admin ? '设为公开' : '申请公开') : '设为私人'}
      message={visibilityTarget === 'public'
        ? (permissions.is_admin ? '确定要将此简历设为公开吗？' : '确定要申请公开此简历吗？')
        : '确定要将此简历设为私人吗？'}
      confirmLabel="确认"
      cancelLabel="取消"
      loading={changingVisibility}
    />
    <ToastContainer toasts={toasts} removeToast={removeToast} />
  </>);
}
