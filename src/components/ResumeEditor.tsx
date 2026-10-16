'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  Plus, Trash2, GripVertical, Save, ChevronDown, ChevronUp,
  User, Briefcase, GraduationCap, Code, FolderOpen,
  FileText, Pencil,
} from 'lucide-react';
import type { ParsedResume } from '@/lib/resume-model';
import type { ResumeRecord } from '@/lib/types';
import { Button, Input } from '@/components/ui';
import { AISectionChat } from '@/components/AISectionChat';
import { ResumeMetadataPanel } from '@/components/ResumeMetadataPanel';
import { ResumeSectionBlocksEditor } from '@/components/ResumeSectionBlocksEditor';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import {
  metadataValuesFromRecord,
  type MetadataKey,
  type ResumeMetadataPatch,
  type ResumeMetadataValues,
} from '@/lib/resume-metadata';
import {
  EditableFrontmatter,
  EditableSection,
  parsedToEditable,
  editableToMarkdown,
  createEmptySection,
  createEmptyEntryBlock,
  createEmptyParagraphBlock,
  sectionWithBlocks,
  type EditableBlock,
} from '@/lib/resume-builder';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface ResumeEditorProps {
  /**
   * The resume record, used for its **metadata columns** (ticket 15).
   *
   * This prop used to be accepted and deliberately ignored. It is now load-bearing: the
   * metadata form reads the columns off it, and `slug` comes from it too. `parsed` cannot
   * supply either — after ticket 17 the server strips frontmatter from the document, so
   * `parsed.frontmatter` is empty and the columns are the only source.
   */
  resume?: ResumeRecord;
  parsed: ParsedResume;
  /**
   * Persists the document.
   *
   * Contract: **report your own failures, do not throw.** The editor has no way to
   * describe a failure usefully — it does not know whether the save was refused by the
   * version lock, rejected for permissions, or lost to the network — so the caller shows
   * the message. A rejection that escapes the editor's click handler becomes an
   * unhandled promise rejection and the user sees nothing.
   */
  onSave: (markdown: string) => Promise<void>;
  /**
   * Persist a metadata patch (ticket 15).
   *
   * Contract differs from `onSave` in one deliberate way: **this one may reject, and the
   * panel catches it.** The metadata endpoint returns field-specific Chinese messages (a
   * malformed email, a rejected URL) that the panel needs in order to highlight the right
   * input, and a `void` return would force the caller to swallow them. Recovery is still the
   * caller's job: it owns the conflict notice and the error banner.
   *
   * Optional on a draft with no resume id (the create flow). Combined with
   * `onMetadataChange`, the panel still edits; it just does not POST until the
   * parent persists the whole draft.
   */
  onSaveMetadata?: (patch: ResumeMetadataPatch, signal: AbortSignal) => Promise<void>;
  /** Current metadata form values, owned by the caller. */
  metadataValues?: ResumeMetadataValues;
  /** Called on every metadata field edit. */
  onMetadataChange?: (key: MetadataKey, value: string) => void;
  /** Server-reported, field-keyed errors to mark the offending inputs. */
  metadataErrors?: Partial<Record<MetadataKey, string>>;
  /** A general metadata failure message, shown above the form. */
  metadataErrorMessage?: string | null;
  /** A metadata success message, shown above the form. */
  metadataSuccessMessage?: string | null;
  /** True while the caller is saving metadata, so the fields lock consistently. */
  metadataSaving?: boolean;
  onCancel: () => void;
  /** Custom title for the editor header */
  headerTitle?: string;
  /** Custom subtitle for the editor header */
  headerSubtitle?: string;
  /** Custom save button label */
  saveLabel?: string;
  /** Custom cancel button label */
  cancelLabel?: string;
  /** Hide the header section */
  hideHeader?: boolean;
  /** Hide the bottom save bar */
  hideBottomBar?: boolean;
  /** Enable AI polish feature */
  enableAI?: boolean;
  /** Callback when content changes (for external state sync) */
  onContentChange?: (markdown: string) => void;
  /**
   * Change this to re-initialise the form from `parsed`.
   *
   * ## Why this prop exists
   *
   * `useState(() => parsedToEditable(parsed))` captures the value from the **first** render and
   * ignores every later `parsed`. That is fine while this component is the only writer,
   * which is the case today — the parent renders it once and never replaces `parsed`. But
   * it means the editor cannot recover from an external change: if `parsed` is ever
   * replaced (a reload, a discard-my-changes action, a fresh fetch after the record
   * finally loads), the form keeps showing the old text and the user would go on editing
   * a document that no longer exists. The failure is silent, which is the bad kind.
   *
   * Synchronising on every `parsed` change is **not** an option: the parent derives
   * `parsed` from what this editor reports through `onContentChange`, so re-initialising
   * whenever it changed would fight the user's typing and reset the form on every
   * keystroke. An explicit token makes the reset an intent rather than a side effect.
   *
   * Leave it undefined if you never replace `parsed`.
   */
  resetToken?: number;
  /**
   * Ask the caller to persist **now**, instead of waiting out its debounce.
   *
   * This is the ticket's "切换章节或失焦时立即保存": both are moments the user has
   * finished with a piece of text, so waiting another 1.5 seconds risks the edit to a
   * navigation. The editor does not save anything itself — it only reports that this is a
   * good moment to, which keeps the save policy in one place.
   *
   * Implementations must be safe to call spuriously: collapsing a section that was never
   * edited, or blurring a field whose text already matches the server, both happen
   * constantly. The autosave hook ignores those; a caller that saved unconditionally
   * would issue a request per click.
   */
  onFlush?: () => void;
}

/**
 * While a card is being dragged, keep the list in view.
 *
 * `Reorder` itself only reorders inside its box; it does not scroll the page when the pointer
 * hits the viewport (or a scrollable ancestor). Without this, a card dragged to the top or
 * bottom of the screen is stuck — the rest of the list never comes into reach.
 */
function scrollWhileDragging(clientY: number, from: HTMLElement | null) {
  const edge = 80;
  const maxSpeed = 22;

  const nudge = (top: number, height: number, scroll: (delta: number) => void) => {
    if (height <= 0) return;
    if (clientY < top + edge) {
      scroll(-maxSpeed * Math.min(1, (top + edge - clientY) / edge));
    } else if (clientY > top + height - edge) {
      scroll(maxSpeed * Math.min(1, (clientY - (top + height - edge)) / edge));
    }
  };

  nudge(0, window.innerHeight, (delta) => window.scrollBy(0, delta));

  let node: HTMLElement | null = from;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    const scrollable =
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1;
    if (scrollable) {
      const rect = node.getBoundingClientRect();
      const target = node;
      nudge(rect.top, rect.height, (delta) => {
        target.scrollTop += delta;
      });
    }
    node = node.parentElement;
  }
}

const SECTION_PRESETS = [
  { title: '关于我', icon: User },
  { title: '工作经历', icon: Briefcase, withEntry: true },
  { title: '教育背景', icon: GraduationCap, withEntry: true },
  { title: '技能', icon: Code },
  { title: '项目经历', icon: FolderOpen, withEntry: true },
] as const;

export function ResumeEditor({
  // Now used for the metadata columns and the slug — see the prop's docblock.
  resume,
  parsed,
  onSave,
  onSaveMetadata,
  metadataValues,
  onMetadataChange,
  metadataErrors,
  metadataErrorMessage,
  metadataSuccessMessage,
  metadataSaving = false,
  onCancel,
  headerTitle = '编辑',
  headerSubtitle = '编辑各模块内容，添加或删除模块',
  saveLabel = '保存',
  cancelLabel = '取消',
  hideHeader = false,
  hideBottomBar = false,
  enableAI = false,
  onContentChange,
  resetToken,
  onFlush,
}: ResumeEditorProps) {
  // Parsed once, on the first render only. `parsedToEditable` walks the whole document, and
  // this used to run on every render while the result was discarded unless it was the first
  // one — so every keystroke re-parsed the entire resume for nothing (A9). The lazy
  // initialiser is what makes "once" true; the `resetToken` block below is the only other
  // reader, and it parses for itself.
  const [initial] = useState(() => parsedToEditable(parsed));
  const [frontmatter, setFrontmatter] = useState<EditableFrontmatter>(initial.frontmatter);
  const [sections, setSections] = useState<EditableSection[]>(initial.sections);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(initial.sections.map((s) => s.id))
  );
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [fmExpanded, setFmExpanded] = useState(true);
  /**
   * True for the duration of a pointer drag. Every section card collapses while this is on, so
   * the list is a stack of headers and the pointer can actually reach the rest of it. The
   * expansion set itself is left alone: dropping restores whatever was open.
   */
  const [isReordering, setIsReordering] = useState(false);
  /**
   * The last section move, announced through a live region.
   *
   * Reordering is a purely visual change — the text stays identical and only its position
   * moves — so without this a screen reader user gets no feedback at all and cannot tell
   * whether the key did anything. Kept in the editor rather than the card because the card
   * unmounts and remounts as the list reorders, which would drop the announcement.
   */
  const [moveAnnouncement, setMoveAnnouncement] = useState('');

  /**
   * The metadata form's values, falling back to the record when the caller does not control
   * them.
   *
   * The fallback is what makes this component usable in both shapes: `ResumePageClient`
   * lifts the state so it can send the patch, while the create flow owns a draft in
   * `metadataValues` (there is no record yet). Reading the caller's values first, then
   * the columns, is what stops the form from rendering empty over good data.
   */
  const effectiveMetadataValues = metadataValues ?? metadataValuesFromRecord(resume ?? {});

  // Re-initialise when the caller asks for it.
  //
  // State, not a ref, and it is written during render: this is the "adjust state when a
  // prop changes" pattern, which React runs before committing, so the user never sees a
  // frame of the stale form. A `useEffect` would paint the old text first and then swap
  // it, which reads as a flicker.
  //
  // Comparing the token rather than `parsed` is the whole point — see the prop's docblock.
  const [lastResetToken, setLastResetToken] = useState(resetToken);
  if (resetToken !== lastResetToken) {
    const reset = parsedToEditable(parsed);
    setLastResetToken(resetToken);
    setFrontmatter(reset.frontmatter);
    setSections(reset.sections);
    // Section ids are regenerated, so the expansion set has to be rebuilt too, or every
    // section collapses (or keeps an id that no longer exists).
    setExpandedSections(new Set(reset.sections.map((s) => s.id)));
  }

  // AI chat history map: shared across all AI dialogs in this editor, keyed by contextKey
  const chatHistoryMap = useRef<Map<string, ChatMsg[]>>(new Map());

  // Notify parent of content changes
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  useEffect(() => {
    if (onContentChangeRef.current) {
      // No frontmatter (ticket 15). The server stores the document without it and the
      // database columns are the metadata authority (ADR-0003), so emitting a block here
      // would send a stale second copy of the metadata on every autosave. The metadata form
      // writes those columns through their own endpoint.
      const markdown = editableToMarkdown(frontmatter, sections, { includeFrontmatter: false });
      onContentChangeRef.current(markdown);
    }
  }, [frontmatter, sections]);

  /**
   * Persist before a deliberate change of context.
   *
   * Called from the two moments the ticket names — a section being switched, and a field
   * losing focus — plus adding or removing a section, which is equally a "done with this"
   * signal. Guarded so an editor used without autosave stays inert.
   */
  const flush = () => {
    onFlush?.();
  };

  const toggleSection = (id: string) => {
    // Collapsing a section is the user moving on, so save before the view changes rather
    // than waiting for the debounce to notice.
    flush();
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Section handlers
  const updateSectionTitle = (sectionId: string, title: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, title } : s))
    );
  };

  const updateSectionBlocks = (sectionId: string, blocks: EditableBlock[]) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? sectionWithBlocks(s, blocks) : s))
    );
  };

  /**
   * Moves a section by one position, or to either end with `to: 'first' | 'last'`.
   *
   * This exists because dragging was the *only* way to reorder sections: the grip carried just
   * `onPointerDown`, and `framer-motion`'s `Reorder.Item` has no keyboard support of its own
   * (verified by reading its source — it wires `drag`, `onDrag`, `onDragEnd`, `onLayoutMeasure`
   * and nothing else). That left keyboard-only users unable to reorder at all, which is WCAG 2.2
   * **2.1.1 Keyboard** (A) and **2.5.7 Dragging Movements** (AA).
   *
   * Deliberately defined on the array rather than derived from `Reorder`'s internal state, so the
   * keyboard path and the drag path are two ways of writing the same index arithmetic and cannot
   * disagree about what "the sections in order" means.
   *
   * Returns the section's new 1-based position, or `null` when the move is a no-op, so the caller
   * can announce the result without guessing.
   */
  const moveSection = (
    sectionId: string,
    to: 'up' | 'down' | 'first' | 'last'
  ): number | null => {
    const from = sections.findIndex((s) => s.id === sectionId);
    if (from === -1) return null;

    const target =
      to === 'up'
        ? from - 1
        : to === 'down'
          ? from + 1
          : to === 'first'
            ? 0
            : sections.length - 1;

    // Clamp rather than refuse: pressing Home on the first section should be harmless, not an
    // error the user has to understand.
    if (target < 0 || target >= sections.length || target === from) return null;

    // Same reason `removeSection` flushes — this is a structural edit, so the user is done with
    // the text as it stands and a navigation straight afterwards must not lose it.
    flush();
    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return next;
    });
    return target + 1;
  };

  const removeSection = (sectionId: string) => {
    // Structural edits change the document, so flush for the same reason a section switch
    // does: the user is finished with it, and a delete followed by a navigation would
    // otherwise lose both the deletion and whatever was typed just before.
    flush();
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  const addSection = (preset?: (typeof SECTION_PRESETS)[number]) => {
    const newSection = createEmptySection();
    if (preset) {
      newSection.title = preset.title;
      if ('withEntry' in preset && preset.withEntry) {
        return finishAddSection(sectionWithBlocks(newSection, [createEmptyEntryBlock()]));
      }
    }
    finishAddSection(newSection);
  };

  const finishAddSection = (newSection: EditableSection) => {
    // Adding a section is a context switch too — the user has moved on from what they were
    // editing.
    flush();
    setSections((prev) => [...prev, newSection]);
    setExpandedSections((prev) => new Set([...prev, newSection.id]));
    setShowAddMenu(false);
  };

  // Save handler
  //
  // The error is swallowed rather than re-thrown, and `onSave` is documented to report
  // its own failures. Re-throwing here would escape a click handler as an unhandled
  // promise rejection, which shows the user nothing at all: the button stops spinning
  // and no message appears, so a refused save would look like a save that did nothing.
  // The caller owns the message because only the caller knows whether the failure was a
  // version conflict (which it already renders as a notice) or something else.
  const handleSave = async () => {
    setSaving(true);
    try {
      // Body only — see the note on the `onContentChange` effect above.
      const markdown = editableToMarkdown(frontmatter, sections, { includeFrontmatter: false });
      await onSave(markdown);
    } catch {
      // Reported by the caller.
    } finally {
      setSaving(false);
    }
  };

  // ── AI helpers ───────────────────────────────────────────────

  // The metadata section's AI chat (`buildFrontmatterContext`, `applyAIToFrontmatter`) was
  // removed with ticket 15. Both worked on `parsed.frontmatter`, which ticket 17 made
  // permanently empty, so the feature had already stopped doing anything. The section-level
  // helpers below are unaffected and still in use.
  /** Build text context for a section to send to AI */
  const buildSectionContext = (section: EditableSection): string => {
    const body = editableToMarkdown(
      {
        name: '',
        title: '',
        email: '',
        phone: '',
        location: '',
        website: '',
        github: '',
        linkedin: '',
        avatar: '',
      },
      [section],
      { includeFrontmatter: false },
    );
    return body.trim();
  };

  /** Apply AI response to a section */
  const applyAIToSection = (sectionId: string, content: string) => {
    // Parse the AI response as a markdown section and convert to editable
    // Wrap it in a minimal structure for parsing
    const wrappedMarkdown = `---\nname: temp\n---\n\n${content}`;
    try {
      const tempParsed = parseResumeMarkdown(wrappedMarkdown);
      if (tempParsed.sections.length > 0) {
        const aiSection = tempParsed.sections[0];
        const { sections: editableSections } = parsedToEditable({
          ...tempParsed,
          sections: [aiSection],
        });
        if (editableSections.length > 0) {
          const aiEditable = editableSections[0];
          setSections((prev) => prev.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  title: aiEditable.title || s.title,
                  content: aiEditable.content,
                  items: aiEditable.items,
                  blocks: aiEditable.blocks ?? [],
                }
              : s
          ));
          return;
        }
      }
      const body = content.replace(/^##\s+.*\n?/, '').trim();
      const paragraph = createEmptyParagraphBlock();
      paragraph.text = body;
      setSections((prev) => prev.map((s) =>
        s.id === sectionId ? sectionWithBlocks({ ...s, content: body }, [paragraph]) : s
      ));
    } catch {
      const body = content.replace(/^##\s+.*\n?/, '').trim();
      const paragraph = createEmptyParagraphBlock();
      paragraph.text = body;
      setSections((prev) => prev.map((s) =>
        s.id === sectionId ? sectionWithBlocks({ ...s, content: body }, [paragraph]) : s
      ));
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 pt-20 pb-20">
      {/* Header */}
      {!hideHeader && (
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight font-serif">
            {headerTitle} <span className="gradient-text">简历</span>
          </h1>
          <p className="text-default-500 mt-1">
            {headerSubtitle}
          </p>
        </div>
      )}

      {/* Metadata section (ticket 15) */}
      {/*
        The body of this card used to be nine `FormField`s bound to `parsed.frontmatter`.
        That stopped being able to work at ticket 17: the server strips frontmatter from the
        stored document, so `parsed.frontmatter` is always empty while the columns hold the
        real values — the fields rendered blank over good data, and saving wrote the blanks
        back. `ResumeMetadataPanel` edits the columns through their own endpoint instead.

        The AI chat button that sat in this card's header is **gone**, not moved. It built its
        context from `parsed.frontmatter` and applied the reply to the frontmatter state, so
        after ticket 17 it was sending an empty context and writing into state that nothing
        read — a control that appeared to work and did nothing, which is worse than an absent
        one. Rebuilding it against the metadata columns is a real feature and belongs in its
        own ticket; the section-level AI chat below is unaffected.
      */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        {onMetadataChange ? (
          <div className="relative rounded-[2rem] border border-default-200 bg-content1">
            <div className="flex items-center gap-3 p-5">
              <User className="w-5 h-5 text-primary" />
              <span className="flex-1 text-lg font-semibold">基本信息</span>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                radius="full"
                onClick={() => setFmExpanded(!fmExpanded)}
                aria-label={fmExpanded ? '收起基本信息' : '展开基本信息'}
                aria-expanded={fmExpanded}
              >
                {fmExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
            <AnimatePresence initial={false}>
              {fmExpanded && (
                <motion.div
                  key="metadata-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="overflow-hidden"
                >
                  <ResumeMetadataPanel
                    hideHeader
                    values={effectiveMetadataValues}
                    originalValues={metadataValuesFromRecord(resume ?? {})}
                    onChange={onMetadataChange}
                    onSave={onSaveMetadata}
                    slug={resume?.slug}
                    isSaving={metadataSaving}
                    serverErrors={metadataErrors}
                    errorMessage={metadataErrorMessage}
                    successMessage={metadataSuccessMessage}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-content1 border border-default-200 rounded-[2rem] p-6">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-primary" />
              <span className="text-lg font-semibold">基本信息</span>
            </div>
            <p className="mt-2 text-sm text-default-500">
              基本信息需要先保存简历后才能编辑。
            </p>
          </div>
        )}
      </motion.div>

      {/* Sections (drag-reorderable) */}
      <Reorder.Group axis="y" values={sections} onReorder={setSections} className="space-y-4">
          {sections.map((section, index) => (
            <DraggableSectionCard
              key={section.id}
              section={section}
              isExpanded={expandedSections.has(section.id) && !isReordering}
              collapseInstantly={isReordering}
              onDragBegin={() => {
                if (isReordering) return;
                flush();
                setIsReordering(true);
              }}
              onDragFinish={() => setIsReordering(false)}
              onToggle={() => toggleSection(section.id)}
              onUpdateTitle={(title) => updateSectionTitle(section.id, title)}
              onUpdateBlocks={(blocks) => updateSectionBlocks(section.id, blocks)}
              onRemove={() => removeSection(section.id)}
              enableAI={enableAI}
              sectionContext={buildSectionContext(section)}
              onApplyAI={(content) => applyAIToSection(section.id, content)}
              chatHistoryMap={chatHistoryMap}
              onFlush={flush}
              onMove={(to) => {
                const moved = moveSection(section.id, to);
                if (moved !== null) {
                  // Announced rather than assumed: the list reorders visually, which a screen
                  // reader user cannot see. Reuses the same live region as the save indicator.
                  setMoveAnnouncement(
                    `「${section.title || '未命名模块'}」已移到第 ${moved} 位，共 ${sections.length} 项`
                  );
                }
              }}
              canMoveUp={index > 0}
              canMoveDown={index < sections.length - 1}
              position={index + 1}
              total={sections.length}
            />
          ))}
      </Reorder.Group>

      {/*
        Announces the result of a keyboard move. `polite` rather than `assertive`: the user
        initiated the move deliberately and does not need the current utterance interrupted,
        but they do need to know where the section landed. Empty by default so it is not read
        on mount.
      */}
      <div role="status" aria-live="polite" className="sr-only">
        {moveAnnouncement}
      </div>

      {/* Add Section */}
      <div className="mt-6 relative">
        <Button
          variant="bordered"
          radius="full"
          fullWidth
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-4 border-dashed text-sm font-medium text-default-500 hover:text-primary"
        >
          <Plus className="w-5 h-5" />
          添加模块
        </Button>

        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-2 left-1/2 -translate-x-1/2 relative bg-content1 border border-default-200 rounded-[2rem] p-3 z-20 min-w-[260px] w-fit mx-auto"
            >
              <p className="text-xs font-medium text-default-500 px-3 py-1.5 mb-1">
                选择模块模板
              </p>
              {SECTION_PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <Button
                    key={preset.title}
                    variant="light"
                    fullWidth
                    onClick={() => addSection(preset)}
                    className="w-full justify-start gap-3 px-3 py-2.5 text-left font-normal"
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{preset.title}</span>
                  </Button>
                );
              })}
              <hr className="my-2 border-default-200" />
              <Button
                variant="light"
                fullWidth
                onClick={() => addSection()}
                className="w-full justify-start gap-3 px-3 py-2.5 text-left font-normal"
              >
                <FileText className="w-4 h-4 text-default-400" />
                <span className="text-sm font-medium">空白模块</span>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom save bar */}
      {!hideBottomBar && (
        <div className="sticky bottom-6 mt-10 flex justify-end gap-3 z-10">
          <div className="bg-content1/95 backdrop-blur-md rounded-[2rem] px-5 py-3 flex items-center gap-3 shadow-sm">
            <span className="text-sm text-default-500">
              {sections.length} 个模块
            </span>
            <div className="w-px h-5 bg-default-200" />
            <Button variant="light" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              color="primary"
              onClick={handleSave}
              isLoading={saving}
              startContent={!saving ? <Save className="w-4 h-4" /> : undefined}
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

interface DraggableSectionCardProps {
  section: EditableSection;
  isExpanded: boolean;
  /**
   * Skip the collapse animation. Used while a drag is in flight, so the cards snap to headers
   * instead of fighting the pointer with a 200ms height tween.
   */
  collapseInstantly?: boolean;
  onDragBegin: () => void;
  onDragFinish: () => void;
  onToggle: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateBlocks: (blocks: EditableBlock[]) => void;
  onRemove: () => void;
  enableAI: boolean;
  sectionContext: string;
  onApplyAI: (content: string) => void;
  chatHistoryMap: React.MutableRefObject<Map<string, ChatMsg[]>>;
  /**
   * Ask the caller to persist now — see `ResumeEditorProps.onFlush`.
   *
   * Threaded down rather than reached for through a context, because the only components
   * that need it are the two that own text fields, and a context would make "this
   * component can trigger a save" invisible at the call site.
   */
  onFlush?: () => void;
  /**
   * Keyboard reordering. The drag grip cannot be the only way to change section order, so the
   * card also exposes explicit move controls — see `moveSection` for the WCAG reasoning.
   *
   * `canMoveUp` / `canMoveDown` are passed in rather than derived here, because only the parent
   * knows the section's position; disabled buttons at the ends are how a user learns where the
   * boundaries are.
   */
  onMove: (to: 'up' | 'down' | 'first' | 'last') => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** 1-based position, for the controls' accessible names. */
  position: number;
  total: number;
}

function DraggableSectionCard({
  section,
  isExpanded,
  collapseInstantly = false,
  onDragBegin,
  onDragFinish,
  onToggle,
  onUpdateTitle,
  onUpdateBlocks,
  onRemove,
  enableAI,
  sectionContext,
  onApplyAI,
  chatHistoryMap,
  onFlush,
  onMove,
  canMoveUp,
  canMoveDown,
  position,
  total,
}: DraggableSectionCardProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={onDragBegin}
      onDragEnd={onDragFinish}
      onDrag={(_, info) => {
        const node =
          typeof document !== 'undefined'
            ? document.elementFromPoint(info.point.x, info.point.y)
            : null;
        scrollWhileDragging(info.point.y, node instanceof HTMLElement ? node : null);
      }}
      className="bg-content1 border border-default-200 rounded-[2rem] list-none"
    >
      {/* Section Header */}
      <div className="flex items-center gap-3 p-5">
        {/*
          The grip is a pointer affordance and stays one, but it is also focusable and answers
          arrow keys: a control that only responds to a drag is the exact failure WCAG 2.5.7
          exists for, and leaving it unreachable would make the visible control a lie for
          keyboard users. Arrow keys are the platform convention for reordering a vertical list
          (Home/End jump to the ends), so this needs no explanation to be discovered — and the
          named buttons beside it are the discoverable, screen-reader-friendly path to the same
          operation.
        */}
        <div
          role="button"
          tabIndex={0}
          aria-label={`拖动调整「${section.title || '未命名模块'}」的顺序，或用方向键移动`}
          className="cursor-grab active:cursor-grabbing touch-none rounded-full p-1 text-default-400 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
          onPointerDown={(e) => dragControls.start(e)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              onMove('up');
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              onMove('down');
            } else if (e.key === 'Home') {
              e.preventDefault();
              onMove('first');
            } else if (e.key === 'End') {
              e.preventDefault();
              onMove('last');
            }
          }}
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/*
          The non-drag way to reorder. These are real buttons rather than a hint, because
          "adjust the order" is a task a keyboard user has to be able to *find*, and a
          focusable icon that does nothing until you guess an arrow key does not give them
          that. Disabled at the ends, so the boundary is visible rather than silently
          ignored.
        */}
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            isDisabled={!canMoveUp}
            aria-label={`上移「${section.title || '未命名模块'}」（第 ${position} / ${total} 项）`}
            onClick={() => onMove('up')}
            className="h-5 min-h-0 w-5 min-w-0 text-default-400 hover:text-primary disabled:opacity-30"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            isDisabled={!canMoveDown}
            aria-label={`下移「${section.title || '未命名模块'}」（第 ${position} / ${total} 项）`}
            onClick={() => onMove('down')}
            className="h-5 min-h-0 w-5 min-w-0 text-default-400 hover:text-primary disabled:opacity-30"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1 group/title relative">
          <Input
            type="text"
            value={section.title}
            onChange={(e) => onUpdateTitle(e.target.value)}
            variant="plain"
            inputSize="lg"
            placeholder="模块标题"
            className="text-lg font-semibold pr-7 py-0.5"
          />
          <Pencil className="w-3.5 h-3.5 absolute right-1 top-1/2 -translate-y-1/2 text-default-400 opacity-0 group-hover/title:opacity-60 transition-opacity pointer-events-none" />
        </div>
        {enableAI && (
          <AISectionChat
            contextKey={`section-${section.id}`}
            sectionTitle={section.title || '未命名模块'}
            sectionContent={sectionContext}
            onApplyContent={onApplyAI}
            chatHistoryMap={chatHistoryMap}
          />
        )}
        <Button
          isIconOnly
          size="sm"
          variant="light"
          radius="full"
          aria-label={
            isExpanded
              ? `收起「${section.title || '未命名模块'}」`
              : `展开「${section.title || '未命名模块'}」`
          }
          aria-expanded={isExpanded}
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          radius="full"
          color="danger"
          aria-label={`删除模块「${section.title || '未命名模块'}」`}
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Section Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: collapseInstantly ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-4">
              <ResumeSectionBlocksEditor
                blocks={section.blocks ?? []}
                onChange={onUpdateBlocks}
                onFlush={onFlush}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

/**
 * There is deliberately no metadata `FormField` here any more.
 *
 * One existed to wrap `ui/Input` for the nine frontmatter fields (ticket 08). Ticket 15
 * replaced those fields with `ResumeMetadataPanel`, which owns its own layout, so the helper
 * had no callers left. Kept as a note rather than silently deleted so the next person does
 * not reintroduce it.
 */

