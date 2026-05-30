'use client';

import { ResumeBuilderPage } from '@/components/ResumeBuilderPage';

/**
 * ⚠️ Deprecated: This component is now a thin wrapper around ResumeBuilderPage,
 * which provides the new split-pane WYSIWYG resume builder.
 * 
 * The old 5-step wizard (choose → upload/template → edit → preview) has been
 * replaced by a streamlined 2-phase flow:
 *   1. Start screen (one page, all creation options)
 *   2. Split-pane editor (live preview + structured form)
 */
export function CreatePageClient() {
  return <ResumeBuilderPage />;
}
