'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  AlignLeft, ChevronDown, ChevronUp, GripVertical, ListTodo, Plus, Tag, Trash2, X,
} from 'lucide-react';
import { Button, Chip, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  createEmptyChip,
  createEmptyChipGroupBlock,
  createEmptyEntryBlock,
  createEmptyParagraphBlock,
  type EditableBlock,
  type EditableChip,
  type EditableSectionItem,
} from '@/lib/resume-builder';

export function ResumeSectionBlocksEditor({
  blocks,
  onChange,
  onFlush,
}: {
  blocks: EditableBlock[];
  onChange: (blocks: EditableBlock[]) => void;
  onFlush?: () => void;
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const addParagraph = () => {
    onChange([...blocks, createEmptyParagraphBlock()]);
    setShowAddMenu(false);
  };

  const addEntry = () => {
    onChange([...blocks, createEmptyEntryBlock()]);
    setShowAddMenu(false);
  };

  const addChip = () => {
    const last = blocks[blocks.length - 1];
    if (last?.type === 'chips') {
      const lastChip = last.chips[last.chips.length - 1];
      if (lastChip && lastChip.text.trim() === '') {
        setShowAddMenu(false);
        return;
      }
      onChange(
        blocks.map((block) =>
          block.id === last.id
            ? { ...last, chips: [...last.chips, createEmptyChip()] }
            : block
        )
      );
    } else {
      onChange([...blocks, createEmptyChipGroupBlock()]);
    }
    setShowAddMenu(false);
  };

  return (
    <div className="space-y-3">
      <Reorder.Group axis="y" values={blocks} onReorder={onChange} className="space-y-3">
        {blocks.map((block, index) => (
          <BlockCard
            key={block.id}
            block={block}
            isDragging={draggingId === block.id}
            onDragBegin={() => setDraggingId(block.id)}
            onDragFinish={() => setDraggingId(null)}
            onChange={(next) =>
              onChange(blocks.map((candidate) => (candidate.id === next.id ? next : candidate)))
            }
            onRemove={() => onChange(blocks.filter((candidate) => candidate.id !== block.id))}
            onMove={(dir) => {
              const target = dir === 'up' ? index - 1 : index + 1;
              if (target < 0 || target >= blocks.length) return;
              const next = [...blocks];
              const [moved] = next.splice(index, 1);
              next.splice(target, 0, moved);
              onChange(next);
            }}
            canMoveUp={index > 0}
            canMoveDown={index < blocks.length - 1}
            onFlush={onFlush}
          />
        ))}
      </Reorder.Group>

      <div className="relative">
        <Button
          variant="bordered"
          radius="full"
          fullWidth
          onClick={() => setShowAddMenu((open) => !open)}
          className="w-full py-3 border-dashed text-sm font-medium text-default-500 hover:text-primary"
        >
          <Plus className="w-4 h-4" />
          添加
        </Button>
        <AnimatePresence>
          {showAddMenu && (
            <div className="mt-2 bg-content1 border border-default-200 rounded-[2rem] p-2 z-20">
              <Button
                variant="light"
                fullWidth
                onClick={addParagraph}
                className="w-full justify-start gap-3 px-3 py-2.5 text-left font-normal"
              >
                <AlignLeft className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">段落</span>
              </Button>
              <Button
                variant="light"
                fullWidth
                onClick={addEntry}
                className="w-full justify-start gap-3 px-3 py-2.5 text-left font-normal"
              >
                <ListTodo className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">条目</span>
              </Button>
              <Button
                variant="light"
                fullWidth
                onClick={addChip}
                className="w-full justify-start gap-3 px-3 py-2.5 text-left font-normal"
              >
                <Tag className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">标签</span>
              </Button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BlockCard({
  block,
  isDragging,
  onDragBegin,
  onDragFinish,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  onFlush,
}: {
  block: EditableBlock;
  isDragging: boolean;
  onDragBegin: () => void;
  onDragFinish: () => void;
  onChange: (block: EditableBlock) => void;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onFlush?: () => void;
}) {
  const dragControls = useDragControls();
  const kindLabel = block.type === 'paragraph' ? '段落' : block.type === 'entry' ? '条目' : '标签组';

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={onDragBegin}
      onDragEnd={onDragFinish}
      layout
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className={cn(
        'list-none rounded-[2rem] border border-default-200 bg-background p-4 space-y-3',
        isDragging && 'shadow-sm z-10'
      )}
    >
      <div className="flex items-center gap-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={`拖动调整${kindLabel}顺序，或用方向键移动`}
          className="cursor-grab active:cursor-grabbing touch-none rounded-full p-1 text-default-400 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
          onPointerDown={(e) => dragControls.start(e)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              onMove('up');
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              onMove('down');
            }
          }}
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            isDisabled={!canMoveUp}
            aria-label={`将${kindLabel}上移`}
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
            aria-label={`将${kindLabel}下移`}
            onClick={() => onMove('down')}
            className="h-5 min-h-0 w-5 min-w-0 text-default-400 hover:text-primary disabled:opacity-30"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
        <span className="flex-1 text-xs font-medium text-default-400">{kindLabel}</span>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          radius="full"
          color="danger"
          aria-label={`删除${kindLabel}`}
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {block.type === 'paragraph' && (
        <Textarea
          label="段落"
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          onBlur={onFlush}
          variant="bordered"
          rows={3}
          placeholder="输入段落内容..."
        />
      )}

      {block.type === 'entry' && (
        <EntryFields
          item={block.item}
          onChange={(item) => onChange({ ...block, item })}
          onFlush={onFlush}
        />
      )}

      {block.type === 'chips' && (
        <ChipGroupEditor
          chips={block.chips}
          onChange={(chips) => {
            if (chips.length === 0) {
              onRemove();
              return;
            }
            onChange({ ...block, chips });
          }}
          onFlush={onFlush}
        />
      )}
    </Reorder.Item>
  );
}

function EntryFields({
  item,
  onChange,
  onFlush,
}: {
  item: EditableSectionItem;
  onChange: (item: EditableSectionItem) => void;
  onFlush?: () => void;
}) {
  const update = (field: keyof Omit<EditableSectionItem, 'id' | 'details'>, value: string) => {
    onChange({ ...item, [field]: value });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          type="text"
          value={item.title}
          onChange={(e) => update('title', e.target.value)}
          onBlur={onFlush}
          inputSize="sm"
          placeholder="标题（如：高级开发工程师）"
        />
        <Input
          type="text"
          value={item.subtitle}
          onChange={(e) => update('subtitle', e.target.value)}
          onBlur={onFlush}
          inputSize="sm"
          placeholder="副标题（如：公司名称）"
        />
        <Input
          type="text"
          value={item.date}
          onChange={(e) => update('date', e.target.value)}
          onBlur={onFlush}
          inputSize="sm"
          placeholder="时间（如：2022年1月 - 至今）"
          className="md:col-span-2"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-default-400">详细描述</label>
        {item.details.map((detail, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-default-400 text-xs">•</span>
            <Input
              type="text"
              value={detail}
              onChange={(e) =>
                onChange({
                  ...item,
                  details: item.details.map((line, i) => (i === idx ? e.target.value : line)),
                })
              }
              inputSize="sm"
              placeholder="描述内容..."
              className="flex-1"
            />
            <Button
              isIconOnly
              size="sm"
              variant="light"
              radius="full"
              color="danger"
              aria-label="删除这条描述"
              onClick={() =>
                onChange({
                  ...item,
                  details: item.details.filter((_, i) => i !== idx),
                })
              }
              disabled={item.details.length <= 1}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="light"
          size="sm"
          onClick={() => onChange({ ...item, details: [...item.details, ''] })}
          className="text-xs text-primary hover:underline gap-1 px-0"
        >
          <Plus className="w-3 h-3" />
          添加描述
        </Button>
      </div>
    </div>
  );
}

function ChipGroupEditor({
  chips,
  onChange,
  onFlush,
}: {
  chips: EditableChip[];
  onChange: (chips: EditableChip[]) => void;
  onFlush?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(
    () => chips.find((chip) => chip.text === '')?.id ?? null
  );

  useEffect(() => {
    if (editingId && chips.some((chip) => chip.id === editingId)) return;
    const empty = chips.find((chip) => chip.text === '')?.id;
    if (empty) setEditingId(empty);
  }, [chips, editingId]);

  const activeId = editingId && chips.some((chip) => chip.id === editingId)
    ? editingId
    : chips.find((chip) => chip.text === '')?.id ?? null;

  const commitChip = (chipId: string, raw: string) => {
    const text = raw.trim();
    if (!text) {
      onChange(chips.filter((chip) => chip.id !== chipId));
      setEditingId(null);
      onFlush?.();
      return;
    }
    onChange(chips.map((chip) => (chip.id === chipId ? { ...chip, text } : chip)));
    setEditingId(null);
    onFlush?.();
  };

  const addAfter = (chipId: string, raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const nextChip = createEmptyChip();
    const next: EditableChip[] = [];
    for (const chip of chips) {
      if (chip.id === chipId) {
        next.push({ ...chip, text });
        next.push(nextChip);
      } else {
        next.push(chip);
      }
    }
    onChange(next);
    setEditingId(nextChip.id);
  };

  return (
    <Reorder.Group
      axis="x"
      values={chips}
      onReorder={onChange}
      className="flex flex-wrap gap-2"
    >
      {chips.map((chip) => (
        <Reorder.Item
          key={chip.id}
          value={chip}
          className="list-none"
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          {activeId === chip.id ? (
            <Input
              type="text"
              value={chip.text}
              autoFocus
              inputSize="sm"
              aria-label="编辑标签"
              placeholder="标签"
              className="w-32"
              onChange={(e) =>
                onChange(chips.map((candidate) =>
                  candidate.id === chip.id ? { ...candidate, text: e.target.value } : candidate
                ))
              }
              onBlur={(e) => commitChip(chip.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAfter(chip.id, (e.target as HTMLInputElement).value);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  commitChip(chip.id, chip.text);
                }
              }}
            />
          ) : (
            <Chip
              variant="bordered"
              size="lg"
              className="cursor-text pr-1"
              onClick={() => setEditingId(chip.id)}
              endContent={
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  radius="full"
                  color="danger"
                  aria-label={`删除标签「${chip.text}」`}
                  className="h-5 min-h-0 w-5 min-w-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(chips.filter((candidate) => candidate.id !== chip.id));
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              }
            >
              {chip.text || '标签'}
            </Chip>
          )}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}
