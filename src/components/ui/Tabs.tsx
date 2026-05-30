'use client';

import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  variant?: 'solid' | 'bordered' | 'underlined' | 'light';
  color?: 'default' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  children?: (key: string) => ReactNode;
}

const sizeMap = {
  sm: 'text-xs h-8',
  md: 'text-sm h-9',
  lg: 'text-base h-10',
};

function Tabs({
  items,
  selectedKey: controlledKey,
  onSelectionChange,
  variant = 'solid',
  color = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
}: TabsProps) {
  const [internalKey, setInternalKey] = useState(items[0]?.key ?? '');
  const selectedKey = controlledKey ?? internalKey;

  const handleSelect = (key: string) => {
    setInternalKey(key);
    onSelectionChange?.(key);
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div
        className={cn(
          'flex items-center gap-0.5',
          variant === 'solid' && 'bg-default-100/50 rounded-xl p-1',
          variant === 'bordered' && 'border-b-2 border-default-200',
          variant === 'underlined' && 'border-b border-default-200',
          variant === 'light' && 'gap-2',
          fullWidth && 'w-full'
        )}
      >
        {items.map((item) => {
          const isSelected = selectedKey === item.key;
          return (
            <button
              key={item.key}
              onClick={() => handleSelect(item.key)}
              className={cn(
                'relative flex items-center justify-center gap-1.5 font-medium transition-all duration-500',
                sizeMap[size],
                fullWidth && 'flex-1',
                variant === 'solid' && [
                  'rounded-lg px-4',
                  isSelected
                    ? 'text-foreground'
                    : 'text-default-500 hover:text-foreground',
                ],
                variant === 'bordered' && [
                  'px-4 -mb-[2px]',
                  isSelected
                    ? 'text-foreground'
                    : 'text-default-500 hover:text-foreground',
                ],
                variant === 'underlined' && [
                  'px-4 -mb-px',
                  isSelected
                    ? 'text-foreground'
                    : 'text-default-500 hover:text-foreground',
                ],
                variant === 'light' && [
                  'px-3 rounded-lg',
                  isSelected
                    ? 'text-foreground bg-default-100'
                    : 'text-default-500 hover:text-foreground hover:bg-default-100/50',
                ]
              )}
            >
              {item.icon}
              {item.label}
              {isSelected && variant === 'solid' && (
                <motion.div
                  layoutId="tabs-indicator"
                  className="absolute inset-0 bg-content1 rounded-lg -z-10"
                  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                />
              )}
              {isSelected && (variant === 'bordered' || variant === 'underlined') && (
                <motion.div
                  layoutId="tabs-underline"
                  className={cn(
                    'absolute bottom-0 left-0 right-0 h-0.5 rounded-full',
                    color === 'primary' && 'bg-primary',
                    color === 'secondary' && 'bg-secondary',
                    color === 'default' && 'bg-foreground',
                  )}
                  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                />
              )}
            </button>
          );
        })}
      </div>
      {children && (
        <div className="mt-4">
          {children(selectedKey)}
        </div>
      )}
    </div>
  );
}

export { Tabs, type TabItem };
