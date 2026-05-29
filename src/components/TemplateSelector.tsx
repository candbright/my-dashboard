'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  TEMPLATE_CATEGORIES,
  RESUME_TEMPLATES,
  type TemplateCategory,
  type ResumeTemplate,
} from '@/lib/resume-templates';

interface TemplateSelectorProps {
  onSelect: (template: ResumeTemplate) => void;
  /** Currently selected template id */
  selectedId?: string;
}

const ACCENT_COLORS: Record<string, string> = {
  primary: 'border-primary bg-primary/5 shadow-primary/10',
  secondary: 'border-secondary bg-secondary/5 shadow-secondary/10',
  success: 'border-success bg-success/5 shadow-success/10',
  warning: 'border-warning bg-warning/5 shadow-warning/10',
  danger: 'border-danger bg-danger/5 shadow-danger/10',
  default: 'border-default-300 bg-default-50 shadow-default/10',
};

const ACCENT_ICON_BG: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  default: 'bg-default-100 text-default-500',
};

export function TemplateSelector({ onSelect, selectedId }: TemplateSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');

  const filtered = activeCategory === 'all'
    ? RESUME_TEMPLATES
    : RESUME_TEMPLATES.filter((t) => t.category === activeCategory);

  return (
    <div>
      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory('all')}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
            activeCategory === 'all'
              ? 'bg-primary text-white shadow-md shadow-primary/20'
              : 'bg-default-100 text-default-600 hover:bg-default-200'
          )}
        >
          全部
        </button>
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
              activeCategory === cat.key
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-default-100 text-default-600 hover:bg-default-200'
            )}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((template) => {
            const isSelected = selectedId === template.id;
            const accentClass = ACCENT_COLORS[template.accent] || ACCENT_COLORS.default;
            const iconBgClass = ACCENT_ICON_BG[template.accent] || ACCENT_ICON_BG.default;
            const categoryLabel = TEMPLATE_CATEGORIES.find(c => c.key === template.category);

            return (
              <motion.button
                key={template.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(template)}
                className={cn(
                  'relative text-left rounded-2xl border-2 p-5 transition-all duration-200',
                  isSelected
                    ? `${accentClass} shadow-lg ring-2 ring-primary/30`
                    : 'border-default-200 bg-content1 hover:border-default-300 hover:shadow-md'
                )}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                  >
                    <Check className="w-3.5 h-3.5 text-white" />
                  </motion.div>
                )}

                {/* Icon */}
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', iconBgClass)}>
                  {template.id === 'blank' ? (
                    <FileText className="w-5 h-5" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                </div>

                {/* Title & description */}
                <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                <p className="text-xs text-default-500 leading-relaxed mb-2">
                  {template.description}
                </p>

                {/* Category badge */}
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-default-400 bg-default-100 px-2 py-0.5 rounded-md">
                  {categoryLabel?.icon} {categoryLabel?.label}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
