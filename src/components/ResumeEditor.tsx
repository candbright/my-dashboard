'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Plus, Trash2, GripVertical, Save, ChevronDown, ChevronUp,
  User, Briefcase, GraduationCap, Code, FolderOpen, X,
  FileText, Loader2, Pencil,
} from 'lucide-react';
import type { ParsedResume } from '@/lib/resume-parser';
import type { ResumeRecord } from '@/lib/types';
import {
  EditableFrontmatter,
  EditableSection,
  EditableSectionItem,
  parsedToEditable,
  editableToMarkdown,
  createEmptySection,
  createEmptyItem,
} from '@/lib/resume-builder';

interface ResumeEditorProps {
  resume: ResumeRecord;
  parsed: ParsedResume;
  onSave: (markdown: string) => Promise<void>;
  onCancel: () => void;
}

const SECTION_PRESETS = [
  { title: '关于我', icon: User, type: 'content' },
  { title: '工作经历', icon: Briefcase, type: 'items' },
  { title: '教育背景', icon: GraduationCap, type: 'items' },
  { title: '技能', icon: Code, type: 'content' },
  { title: '项目经历', icon: FolderOpen, type: 'items' },
];

export function ResumeEditor({ resume, parsed, onSave, onCancel }: ResumeEditorProps) {
  const { frontmatter: initFm, sections: initSections } = parsedToEditable(parsed);
  const [frontmatter, setFrontmatter] = useState<EditableFrontmatter>(initFm);
  const [sections, setSections] = useState<EditableSection[]>(initSections);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(initSections.map((s) => s.id))
  );
  const [showAddMenu, setShowAddMenu] = useState(false);

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

  return (
    <div className="max-w-4xl mx-auto px-6 pt-20 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            编辑 <span className="gradient-text">简历</span>
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1">
            编辑各模块内容，添加或删除模块
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>

      {/* Frontmatter Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-6"
      >
        <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
          <User className="w-5 h-5 text-[var(--accent)]" />
          基本信息
        </h2>
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
      </motion.div>

      {/* Sections */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {sections.map((section, index) => (
            <motion.div
              key={section.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden"
            >
              {/* Section Header */}
              <div className="flex items-center gap-3 p-5 border-b border-[var(--border)]">
                <GripVertical className="w-4 h-4 text-[var(--muted-foreground)] cursor-grab" />
                <div className="flex-1 group/title relative">
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                    className="text-lg font-semibold bg-transparent w-full outline-none placeholder:text-[var(--muted-foreground)] border-b-2 border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] transition-colors duration-200 py-0.5 pr-7"
                    placeholder="模块标题"
                  />
                  <Pencil className="w-3.5 h-3.5 absolute right-1 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] opacity-0 group-hover/title:opacity-60 transition-opacity pointer-events-none" />
                </div>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors"
                >
                  {expandedSections.has(section.id) ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => removeSection(section.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Section Content */}
              <AnimatePresence>
                {expandedSections.has(section.id) && (
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
                        <label className="text-sm font-medium text-[var(--muted-foreground)] mb-1.5 block">
                          段落内容（可选，适合"关于我"等章节）
                        </label>
                        <textarea
                          value={section.content}
                          onChange={(e) => updateSectionContent(section.id, e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none resize-y text-sm min-h-[80px] transition-colors"
                          placeholder="输入段落内容..."
                          rows={3}
                        />
                      </div>

                      {/* Items */}
                      {section.items.length > 0 && (
                        <div className="space-y-4">
                          <label className="text-sm font-medium text-[var(--muted-foreground)]">
                            条目列表
                          </label>
                          {section.items.map((item, itemIndex) => (
                            <SectionItemEditor
                              key={item.id}
                              item={item}
                              sectionId={section.id}
                              onUpdate={updateItem}
                              onRemove={removeItem}
                              onAddDetail={addDetail}
                              onRemoveDetail={removeDetail}
                              onUpdateDetail={updateDetail}
                            />
                          ))}
                        </div>
                      )}

                      {/* Add item button */}
                      <button
                        onClick={() => addItem(section.id)}
                        className="w-full py-3 rounded-xl border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        添加条目
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add Section */}
      <div className="mt-6 relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors flex items-center justify-center gap-2"
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
              className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl p-3 z-20 min-w-[260px]"
            >
              <p className="text-xs font-medium text-[var(--muted-foreground)] px-3 py-1.5 mb-1">
                选择模块模板
              </p>
              {SECTION_PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.title}
                    onClick={() => addSection(preset)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--muted)] transition-colors text-left"
                  >
                    <Icon className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-sm font-medium">{preset.title}</span>
                  </button>
                );
              })}
              <hr className="my-2 border-[var(--border)]" />
              <button
                onClick={() => addSection()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--muted)] transition-colors text-left"
              >
                <FileText className="w-4 h-4 text-[var(--muted-foreground)]" />
                <span className="text-sm font-medium">空白模块</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom save bar */}
      <div className="sticky bottom-6 mt-10 flex justify-end gap-3 z-10">
        <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-sm text-[var(--muted-foreground)]">
            {sections.length} 个模块
          </span>
          <div className="w-px h-5 bg-[var(--border)]" />
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--muted)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

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
    <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            value={item.title}
            onChange={(e) => onUpdate(sectionId, item.id, 'title', e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm transition-colors"
            placeholder="标题（如：高级开发工程师）"
          />
          <input
            type="text"
            value={item.subtitle}
            onChange={(e) => onUpdate(sectionId, item.id, 'subtitle', e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm transition-colors"
            placeholder="副标题（如：公司名称）"
          />
          <input
            type="text"
            value={item.date}
            onChange={(e) => onUpdate(sectionId, item.id, 'date', e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm transition-colors md:col-span-2"
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
        <label className="text-xs font-medium text-[var(--muted-foreground)]">详细描述</label>
        {item.details.map((detail, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[var(--muted-foreground)] text-xs">•</span>
            <input
              type="text"
              value={detail}
              onChange={(e) => onUpdateDetail(sectionId, item.id, idx, e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm transition-colors"
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
          className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 pt-1"
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
      <label className="text-sm font-medium text-[var(--muted-foreground)] mb-1.5 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm transition-colors"
      />
    </div>
  );
}
