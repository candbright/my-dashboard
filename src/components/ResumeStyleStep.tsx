'use client';

/**
 * Step 1 of the creation wizard: 选择模板 — the style (ticket 48).
 *
 * The step is deliberately almost all `TemplateSelector`: what makes it a step rather than a panel is
 * the sentence that says what this choice *is* (a style, not a document), which is the one thing the
 * ticket's first acceptance criterion turns on — 不同简历模板改变的应该是简历的 ui 风格，而不是实际内容.
 * Saying it in the step's own words is the cheapest place to prevent the whole misreading.
 *
 * The action bar is the shared `WizardActionBar`, so 下一步 sits in the same slot as every other
 * phase's primary action. There is no 上一步 on this step — it is the first — and the empty left
 * slot is what keeps 下一步 from jumping when the user later comes back.
 */

import { ArrowRight } from 'lucide-react';
import { TemplateSelector } from '@/components/TemplateSelector';
import { WizardActionBar } from '@/components/WizardActionBar';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface ResumeStyleStepProps {
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  /** The resolved accent, as `TemplateSelector` documents. */
  accent: string;
  onAccentChange: (hex: string) => void;
  onNext: () => void;
  className?: string;
}

export function ResumeStyleStep({
  selectedTemplateId,
  onSelectTemplate,
  accent,
  onAccentChange,
  onNext,
  className,
}: ResumeStyleStepProps) {
  return (
    <div className={cn('pb-4', className)}>
      <TemplateSelector
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={onSelectTemplate}
        accent={accent}
        onAccentChange={onAccentChange}
      />

      <WizardActionBar
        right={
          <Button
            color="primary"
            size="sm"
            endContent={<ArrowRight className="w-4 h-4" />}
            onClick={onNext}
            data-step-next="style"
          >
            下一步
          </Button>
        }
      />
    </div>
  );
}
