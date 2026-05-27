'use client';

import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ResumePrintView } from '@/components/ResumePrintView';
import type { ResumeRecord } from '@/lib/types';
import type { ParsedResume } from '@/lib/resume-parser';

/**
 * Hook that manages PDF export from a parsed resume.
 * Renders a hidden print view, captures it with html2canvas, and generates a PDF with jsPDF.
 */
export function usePdfExport() {
  const [exporting, setExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const exportPdf = useCallback(async (resume: ResumeRecord, parsed: ParsedResume) => {
    setExporting(true);

    try {
      // Dynamically import heavy libs
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);

      // Create off-screen container
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.zIndex = '-1';
      container.style.background = '#ffffff';
      document.body.appendChild(container);
      containerRef.current = container;

      // Render the print view into the container
      const { createRoot } = await import('react-dom/client');
      const root = createRoot(container);

      await new Promise<void>((resolve) => {
        root.render(
          <ResumePrintView resume={resume} parsed={parsed} />
        );
        // Wait for render + images to load
        setTimeout(resolve, 800);
      });

      const printRoot = container.querySelector('#resume-print-root') as HTMLElement;
      if (!printRoot) {
        throw new Error('Print root not found');
      }

      // Capture with html2canvas
      const canvas = await html2canvas(printRoot, {
        scale: 2, // High quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      // Calculate PDF dimensions (A4)
      const imgWidth = 210; // mm
      const pageHeight = 297; // mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgData = canvas.toDataURL('image/png');

      // Add pages if content exceeds one page
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download
      const fileName = `${resume.name || resume.title || 'resume'}-简历.pdf`;
      pdf.save(fileName);

      // Cleanup
      root.unmount();
      document.body.removeChild(container);
      containerRef.current = null;
    } catch (error) {
      console.error('PDF export failed:', error);
      throw error;
    } finally {
      setExporting(false);
    }
  }, []);

  return { exportPdf, exporting };
}
