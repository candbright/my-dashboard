import { extractPdfText } from '@/lib/pdf-assert';
import { reportFromExtractedText, type AtsReport } from '@/lib/ats-report';

/**
 * Turns a produced PDF into an ATS readability report.
 *
 * Split out of `AtsPreview.tsx` so it can be driven by a plain Node script
 * (`npm run verify:ats`). A `.tsx` module cannot be imported by
 * `node --experimental-strip-types`, and the extraction path is the part worth
 * verifying against real PDF bytes — the React component around it is presentation.
 */

export interface AnalysedFile {
  report: AtsReport;
  fileName: string;
}

/** Analyses a PDF `File` (browser) into a report. */
export async function analysePdfFile(file: File): Promise<AnalysedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return analysePdfBytes(bytes, file.name);
}

/** Analyses PDF bytes into a report. The shared implementation. */
export async function analysePdfBytes(bytes: Uint8Array, fileName = 'resume.pdf'): Promise<AnalysedFile> {
  const stats = await extractPdfText(bytes);

  return {
    // `stats.text` is the extraction; `stats.pageCount` is how many pages were walked.
    // Neither is re-derived here, so the report describes the same bytes the export
    // assertion looked at.
    report: reportFromExtractedText(stats.text, stats.pageCount),
    fileName,
  };
}
