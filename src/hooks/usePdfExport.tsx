'use client';

import { useState, useCallback } from 'react';
import { PRINT_EXPORT_HINT, exportResumeImage, exportResumePdf } from '@/lib/export-pdf';
import type { ResumeRecord } from '@/lib/types';
import type { ParsedResumeWithMetadata } from '@/lib/resume-model';

/**
 * PDF export, as a hook.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANSITIONAL IMPLEMENTATION — Phase 1 of ADR-0001.
 *
 * `exportPdf` delegates to the browser's own print pipeline so the produced
 * document has a real text layer. The contract is ADR-0007
 * (`RenderResume(结构化内容, 展示态) → (文件字节, 渲染告警[])`); Phase 4 replaces
 * the implementation behind `exportResumePdf` with the render service chosen by
 * the ADR-0002 spike, and this hook should not need to change.
 *
 * The previous implementation rasterised the page with html2canvas and wrapped
 * the bitmap in jsPDF. That produced a PDF with **no text layer at all**, which
 * every applicant tracking system fails to parse. It survives as `exportImage`,
 * explicitly named, because a PNG is genuinely useful in chat apps — but it is
 * never offered as "导出 PDF".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Verification: `test/` covers the print document's text payload and the styles
 * that keep app chrome off the page. Verifying the *file* a browser produces
 * requires the browser's print-to-PDF, so it lives in the manual checklist in
 * `.scratch/resume-platform/issues/03-browser-print-export.md` rather than in
 * this suite — see that ticket's Comments for the reasoning.
 */
export function usePdfExport() {
  const [exporting, setExporting] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);

  const exportPdf = useCallback(async (resume: ResumeRecord, parsed: ParsedResumeWithMetadata) => {
    setExporting(true);
    try {
      await exportResumePdf(resume, parsed);
    } catch (error) {
      console.error('PDF export failed:', error);
      throw error;
    } finally {
      setExporting(false);
    }
  }, []);

  const exportImage = useCallback(async (resume: ResumeRecord, parsed: ParsedResumeWithMetadata) => {
    setExportingImage(true);
    try {
      await exportResumeImage(resume, parsed);
    } catch (error) {
      console.error('Image export failed:', error);
      throw error;
    } finally {
      setExportingImage(false);
    }
  }, []);

  return { exportPdf, exporting, exportImage, exportingImage, hint: PRINT_EXPORT_HINT };
}
