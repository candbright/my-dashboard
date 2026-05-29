'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  Plus, Trash2, GripVertical, Save, ChevronDown, ChevronUp,
  User, Briefcase, GraduationCap, Code, FolderOpen, X,
  FileText, Pencil,
} from 'lucide-react';
import type { ParsedResume } from '@/lib/resume-parser';
import type { ResumeRecord } from '@/lib/types';
import { Button } from '@/components/ui';
import { AISectionChat } from '@/components/AISectionChat';
import { parseResumeMarkdown } from '@/lib/resume-parser';
import {
  EditableFrontmatter,
  EditableSection,
  EditableSectionItem,
  parsedToEditable,
  editableToMarkdown,
  createEmptySection,
  createEmptyItem,
} from '@/lib/resume-builder';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface ResumeEditorProps {
  /** Existing resume record (optional for create flow) */
  resume?: ResumeRecord;
  parsed: ParsedResume;
  onSave: (markdown: string) => Promise<void>;
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
}

const SECTION_PRESETS = [
  { title: '关于我', icon: User, type: 'content' },
  { title: '工作经历', icon: Briefcase, type: 'items' },
  { title: '教育背景', icon: GraduationCap, type: 'items' },
  { title: '技能', icon: Code, type: 'content' },
  { title: '项目经历', icon: FolderOpen, type: 'items' },
];

export function ResumeEditor({
  resume,
  parsed,
  onSave,
  onCancel,
  headerTitle = '编辑',
  headerSubtitle = '编辑各模块内容，添加或删除模块',
  saveLabel = '保存',
  cancelLabel = '取消',
  hideHeader = false,
  hideBottomBar = false,
  enableAI = false,
  onContentChange,
}: ResumeEditorProps) {
  const { frontmatter: initFm, sections: initSections } = parsedToEditable(parsed);
  const [frontmatter, setFrontmatter] = useState<EditableFrontmatter>(initFm);
  const [sections, setSections] = useState<EditableSection[]>(initSections);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(initSections.map((s) => s.id))
  );
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [fmExpanded, setFmExpanded] = useState(true);

  // AI chat history map: shared across all AI dialogs in this editor, keyed by contextKey
  const chatHistoryMap = useRef<Map<string, ChatMsg[]>>(new Map());

  // Notify parent of content changes
  useEffect(() => {
    if (onContentChange) {
      const markdown = editableToMarkdown(frontmatter, sections);
      onContentChange(markdown);
    }
  }, [frontmatter, sections, onContentChange]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Frontmatter handlers
  const updateFm = (key: keyof EditableFrontmatter, value: string) => {
    setFrontmatter((prev) => ({ ...prev, [key]: value }));
  };

  // Section handlers
  const updateSectionTitle = (sectionId: string, title: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, title } : s))
    );
  };

  const updateSectionContent = (sectionId: string, content: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, content } : s))
    );
  };

  const removeSection = (sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  };

  const addSection = (preset?: typeof SECTION_PRESETS[0]) => {
    const newSection = createEmptySection();
    if (preset) {
      newSection.title = preset.title;
      if (preset.type === 'items') {
        newSection.items = [createEmptyItem()];
      }
    }
    setSections((prev) => [...prev, newSection]);
    setExpandedSections((prev) => new Set([...prev, newSection.id]));
    setShowAddMenu(false);
  };

  // Item handlers
  const addItem = (sectionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, items: [...s.items, createEmptyItem()] } : s
      )
    );
  };

  const removeItem = (sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.filter((item) => item.id !== itemId) }
          : s
      )
    );
  };

  const updateItem = (
    sectionId: string,
    itemId: string,
    field: keyof Omit<EditableSectionItem, 'id' | 'details'>,
    value: string
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item
              ),
            }
          : s
      )
    );
  };

  // Details handlers
  const addDetail = (sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((item) =>
                item.id === itemId
                  ? { ...item, details: [...item.details, ''] }
                  : item
              ),
            }
          : s
      )
    );
  };

  const removeDetail = (sectionId: string, itemId: string, detailIndex: number) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((item) =>
                item.id === itemId
                  ? { ...item, details: item.details.filter((_, i) => i !== detailIndex) }
                  : item
              ),
            }
          : s
      )
    );
  };

  const updateDetail = (sectionId: string, itemId: string, detailIndex: number, value: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      details: item.details.map((d, i) => (i === detailIndex ? value : d)),
                    }
                  : item
              ),
            }
          : s
      )
    );
  };

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const markdown = editableToMarkdown(frontmatter, sections);
      await onSave(markdown);
    } finally {
      setSaving(false);
    }
  };

  // ── AI helpers ───────────────────────────────────────────────

  /** Build text context for frontmatter to send to AI */
  const buildFrontmatterContext = (fm: EditableFrontmatter): string => {
    const lines: string[] = ['---'];
    if (fm.name) lines.push(`name: ${fm.name}`);
    if (fm.title) lines.push(`title: ${fm.title}`);
    if (fm.email) lines.push(`email: ${fm.email}`);
    if (fm.phone) lines.push(`phone: ${fm.phone}`);
    if (fm.location) lines.push(`location: ${fm.location}`);
    if (fm.website) lines.push(`website: ${fm.website}`);
    if (fm.github) lines.push(`github: ${fm.github}`);
    if (fm.linkedin) lines.push(`linkedin: ${fm.linkedin}`);
    if (fm.avatar) lines.push(`avatar: ${fm.avatar}`);
    lines.push('---');
    return lines.join('\n');
  };

  /** Build text context for a section to send to AI */
  const buildSectionContext = (section: EditableSection): string => {
    const lines: string[] = [`## ${section.title}`];
    if (section.content.trim()) lines.push(section.content.trim());
    for (const item of section.items) {
      const itemTitle = item.subtitle ? `### ${item.title} | ${item.subtitle}` : `### ${item.title}`;
      lines.push(itemTitle);
      if (item.date) lines.push(`*${item.date}*`);
      for (const detail of item.details) {
        if (detail.trim()) lines.push(`- ${detail.trim()}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  };

  /** Apply AI response to frontmatter fields */
  const applyAIToFrontmatter = (content: string) => {
    // Try to parse frontmatter from AI response
    const fmMatch = content.match(/---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fmText = fmMatch[1];
      const newFm = { ...frontmatter };
      const fieldMap: Record<string, keyof EditableFrontmatter> = {
        name: 'name', title: 'title', email: 'email', phone: 'phone',
        location: 'location', website: 'website', github: 'github',
        linkedin: 'linkedin', avatar: 'avatar',
      };
      for (const line of fmText.split('\n')) {
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
          const key = fieldMap[match[1]];
          if (key) newFm[key] = match[2].trim();
        }
      }
      setFrontmatter(newFm);
    }
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
          setSections(prev => prev.map(s =>
            s.id === sectionId
              ? { ...s, title: aiEditable.title || s.title, content: aiEditable.content, items: aiEditable.items }
              : s
          ));
        }
      } else {
        // Fallback: treat as raw content for that section
        setSections(prev => prev.map(s =>
          s.id === sectionId
            ? { ...s, content: content.replace(/^##\s+.*\n?/, '').trim() }
            : s
        ));
      }
    } catch {
      // Fallback: just set as raw content
      setSections(prev => prev.map(s =>
        s.id === sectionId
          ? { ...s, content: content.replace(/^##\s+.*\n?/, '').trim() }
          : s
      ));
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 pt-20 pb-20">
      {/* Header */}
      {!hideHeader && (
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            {headerTitle} <span className="gradient-text">简历</span>
          </h1>
          <p className="text-default-500 mt-1">
            {headerSubtitle}
          </p>
        </div>
      )}

      {/* Frontmatter Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-content1 border border-default-200 rounded-2xl mb-6"
      >
        {/* Frontmatter Header (always visible) */}
        <div className="flex items-center gap-3 p-5 border-b border-default-200">
          <User className="w-5 h-5 text-primary" />
          <span className="text-lg font-semibold flex-1">基本信息</span>
          {enableAI && (
            <AISectionChat
              contextKey="frontmatter"
              sectionTitle="基本信息"
              sectionContent={buildFrontmatterContext(frontmatter)}
              onApplyContent={(content) => applyAIToFrontmatter(content)}
              chatHistoryMap={chatHistoryMap}
            />
          )}
          <button
            onClick={() => setFmExpanded(!fmExpanded)}
            className="p-1.5 rounded-lg hover:bg-default-100 transition-colors"
          >
            {fmExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {/* Frontmatter Content (collapsible) */}
        <AnimatePresence>
          {fmExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="姓名" value={frontmatter.name} onChange={(v) => updateFm('name', v)} placeholder="张三" />
                  <FormField label="职位" value={frontmatter.title} onChange={(v) => updateFm('title', v)} placeholder="全栈开发工程师" />
                  <FormField label="邮箱" value={frontmatter.email} onChange={(v) => updateFm('email', v)} placeholder="email@example.com" type="email" />
                  <FormField label="电话" value={frontmatter.phone} onChange={(v) => updateFm('phone', v)} placeholder="+86 138-0000-0000" />
                  <FormField label="地点" value={frontmatter.location} onChange={(v) => updateFm('location', v)} placeholder="北京市" />
                  <FormField label="网站" value={frontmatter.website} onChange={(v) => updateFm('website', v)} placeholder="https://example.com" />
                  <FormField label="GitHub" value={frontmatter.github} onChange={(v) => updateFm('github', v)} placeholder="https://github.com/username" />
                  <FormField label="LinkedIn" value={frontmatter.linkedin} onChange={(v) => updateFm('linkedin', v)} placeholder="https://linkedin.com/in/username" />
                  <FormField label="头像" value={frontmatter.avatar} onChange={(v) => updateFm('avatar', v)} placeholder="https://example.com/avatar.jpg" className="md:col-span-2" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Sections (drag-reorderable) */}
      <Reorder.Group axis="y" values={sections} onReorder={setSections} className="space-y-4">
          {sections.map((section) => (
            <DraggableSectionCard
              key={section.id}
              section={section}
              isExpanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              onUpdateTitle={(title) => updateSectionTitle(section.id, title)}
              onUpdateContent={(content) => updateSectionContent(section.id, content)}
              onRemove={() => removeSection(section.id)}
              onAddItem={() => addItem(section.id)}
              enableAI={enableAI}
              sectionContext={buildSectionContext(section)}
              onApplyAI={(content) => applyAIToSection(section.id, content)}
              chatHistoryMap={chatHistoryMap}
              items={section.items}
              sectionId={section.id}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onAddDetail={addDetail}
              onRemoveDetail={removeDetail}
              onUpdateDetail={updateDetail}
            />
          ))}
      </Reorder.Group>

      {/* Add Section */}
      <div className="mt-6 relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-default-200 hover:border-primary text-sm font-medium text-default-500 hover:text-primary transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          添加模块
        </button>

        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-2 left-1/2 -translate-x-1/2 relative bg-content1 border border-default-200 rounded-2xl shadow-xl p-3 z-20 min-w-[260px] w-fit mx-auto"
            >
              <p className="text-xs font-medium text-default-500 px-3 py-1.5 mb-1">
                选择模块模板
              </p>
              {SECTION_PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.title}
                    onClick={() => addSection(preset)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-default-100 transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{preset.title}</span>
                  </button>
                );
              })}
              <hr className="my-2 border-default-200" />
              <button
                onClick={() => addSection()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-default-100 transition-colors text-left"
              >
                <FileText className="w-4 h-4 text-default-400" />
                <span className="text-sm font-medium">空白模块</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom save bar */}
      {!hideBottomBar && (
        <div className="sticky bottom-6 mt-10 flex justify-end gap-3 z-10">
          <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3 shadow-lg">
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
  onToggle: () => void;
  onUpdateTitle: (title: string) => void;
  onUpdateContent: (content: string) => void;
  onRemove: () => void;
  onAddItem: () => void;
  enableAI: boolean;
  sectionContext: string;
  onApplyAI: (content: string) => void;
  chatHistoryMap: React.MutableRefObject<Map<string, ChatMsg[]>>;
  items: EditableSectionItem[];
  sectionId: string;
  onUpdateItem: (sectionId: string, itemId: string, field: keyof Omit<EditableSectionItem, 'id' | 'details'>, value: string) => void;
  onRemoveItem: (sectionId: string, itemId: string) => void;
  onAddDetail: (sectionId: string, itemId: string) => void;
  onRemoveDetail: (sectionId: string, itemId: string, detailIndex: number) => void;
  onUpdateDetail: (sectionId: string, itemId: string, detailIndex: number, value: string) => void;
}

function DraggableSectionCard({
  section,
  isExpanded,
  onToggle,
  onUpdateTitle,
  onUpdateContent,
  onRemove,
  onAddItem,
  enableAI,
  sectionContext,
  onApplyAI,
  chatHistoryMap,
  items,
  sectionId,
  onUpdateItem,
  onRemoveItem,
  onAddDetail,
  onRemoveDetail,
  onUpdateDetail,
}: DraggableSectionCardProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={section}
      dragListener={false}
      dragControls={dragControls}
      className="bg-content1 border border-default-200 rounded-2xl list-none"
    >
      {/* Section Header */}
      <div className="flex items-center gap-3 p-5 border-b border-default-200">
        <div
          className="cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={(e) => dragControls.start(e)}
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-4 h-4 text-default-400" />
        </div>
        <div className="flex-1 group/title relative">
          <input
            type="text"
            value={section.title}
            onChange={(e) => onUpdateTitle(e.target.value)}
            className="text-lg font-semibold bg-transparent w-full outline-none placeholder:text-default-400 border-b-2 border-transparent hover:border-default-200 focus:border-primary transition-colors duration-200 py-0.5 pr-7"
            placeholder="模块标题"
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
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-default-100 transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Section Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-4">
              {/* Content textarea */}
              <div>
                <label className="text-sm font-medium text-default-500 mb-1.5 block">
                  段落内容（可选，适合"关于我"等章节）
                </label>
                <textarea
                  value={section.content}
                  onChange={(e) => onUpdateContent(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-default-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-y text-sm min-h-[80px] transition-colors"
                  placeholder="输入段落内容..."
                  rows={3}
                />
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div className="space-y-4">
                  <label className="text-sm font-medium text-default-500">
                    条目列表
                  </label>
                  {items.map((item) => (
                    <SectionItemEditor
                      key={item.id}
                      item={item}
                      sectionId={sectionId}
                      onUpdate={onUpdateItem}
                      onRemove={onRemoveItem}
                      onAddDetail={onAddDetail}
                      onRemoveDetail={onRemoveDetail}
                      onUpdateDetail={onUpdateDetail}
                    />
                  ))}
                </div>
              )}

              {/* Add item button */}
              <button
                onClick={onAddItem}
                className="w-full py-3 rounded-xl border-2 border-dashed border-default-200 hover:border-primary text-sm font-medium text-default-500 hover:text-primary transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                添加条目
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

function SectionItemEditor({
  item,
  sectionId,
  onUpdate,
  onRemove,
  onAddDetail,
  onRemoveDetail,
  onUpdateDetail,
}: {
  item: EditableSectionItem;
  sectionId: string;
  onUpdate: (sectionId: string, itemId: string, field: keyof Omit<EditableSectionItem, 'id' | 'details'>, value: string) => void;
  onRemove: (sectionId: string, itemId: string) => void;
  onAddDetail: (sectionId: string, itemId: string) => void;
  onRemoveDetail: (sectionId: string, itemId: string, detailIndex: number) => void;
  onUpdateDetail: (sectionId: string, itemId: string, detailIndex: number, value: string) => void;
}) {
  return (
    <div className="bg-background border border-default-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            value={item.title}
            onChange={(e) => onUpdate(sectionId, item.id, 'title', e.target.value)}
            className="px-3 py-2 rounded-lg bg-content1 border border-default-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-colors"
            placeholder="标题（如：高级开发工程师）"
          />
          <input
            type="text"
            value={item.subtitle}
            onChange={(e) => onUpdate(sectionId, item.id, 'subtitle', e.target.value)}
            className="px-3 py-2 rounded-lg bg-content1 border border-default-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-colors"
            placeholder="副标题（如：公司名称）"
          />
          <input
            type="text"
            value={item.date}
            onChange={(e) => onUpdate(sectionId, item.id, 'date', e.target.value)}
            className="px-3 py-2 rounded-lg bg-content1 border border-default-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-colors md:col-span-2"
            placeholder="时间（如：2022年1月 - 至今）"
          />
        </div>
        <button
          onClick={() => onRemove(sectionId, item.id)}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Details */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-default-400">详细描述</label>
        {item.details.map((detail, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-default-400 text-xs">•</span>
            <input
              type="text"
              value={detail}
              onChange={(e) => onUpdateDetail(sectionId, item.id, idx, e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-content1 border border-default-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-colors"
              placeholder="描述内容..."
            />
            <button
              onClick={() => onRemoveDetail(sectionId, item.id, idx)}
              className="p-1 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
              disabled={item.details.length <= 1}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onAddDetail(sectionId, item.id)}
          className="text-xs text-primary hover:underline flex items-center gap-1 pt-1"
        >
          <Plus className="w-3 h-3" />
          添加描述
        </button>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-default-500 mb-1.5 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-background border border-default-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm transition-colors"
      />
    </div>
  );
}
