import { jsPDF } from 'jspdf';

/**
 * PDF fixtures shared by the test suite and the ATS verification script.
 *
 * These are generated rather than committed as binaries: a real CJK font is ~9 MB and
 * would need a subsetting toolchain, while what is actually under test is the CMap
 * round trip that decides whether CJK survives extraction — not the font.
 *
 * This module exists (rather than the builders living in `pdf-assert.test.ts`) because
 * `scripts/verify-ats-report.mjs` drives the very same acceptance cases against the
 * very same bytes. A second copy of a fixture is a second thing that can drift out of
 * agreement with what the assertion is supposed to catch.
 */

/** A minimal valid 1x1 opaque PNG, hand-built so the fixture needs no canvas. */
export const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
  0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Builds a minimal valid PDF using the Identity-H convention: the content stream
 * carries 2-byte glyph codes and a `/ToUnicode` CMap maps those codes back to
 * arbitrary Unicode code points.
 *
 * Hand-built on purpose. Committing a real CJK font for a fixture would add ~9 MB
 * and a subsetting toolchain; this isolates exactly the layer under test — the
 * CMap round trip that decides whether CJK survives extraction — with no font.
 *
 * @param codePoints Unicode code points to emit, one glyph each.
 */
export function buildCjkPdf(codePoints: number[]): Uint8Array {
  const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, '0');

  const textOps = codePoints.map((_, index) => `<${hex4(index)}> Tj`).join('\n');
  const contentStream = `BT\n/F1 12 Tf\n72 720 Td\n${textOps}\nET\n`;

  const toUnicodeCmap = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    `${codePoints.length} beginbfchar`,
    ...codePoints.map((cp, index) => `<${hex4(index)}> <${hex4(cp)}>`),
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
    '',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /Custom /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Custom /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /DW 1000 >>',
    `<< /Length ${toUnicodeCmap.length} >>\nstream\n${toUnicodeCmap}endstream`,
    '<< /Type /FontDescriptor /FontName /Custom /Flags 4 /FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

/** A PDF with a real text layer, as a text-writing exporter produces. */
export function buildTextPdf(): Uint8Array {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica');
  pdf.setFontSize(14);
  pdf.text('Zhang San', 20, 30);
  pdf.text('Backend Engineer', 20, 40);
  return new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer);
}

/**
 * The bitmap pipeline's output shape: a full-page image and no text operators.
 *
 * This mirrors what the old `usePdfExport` produced (html2canvas → jsPDF `addImage`),
 * which is the concrete reason the text-layer assertion exists, and the fixture the
 * ATS report must classify as an unreadable file.
 */
export function buildImageOnlyPdf(): Uint8Array {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.addImage(`data:image/png;base64,${bytesToBase64(PNG_1X1)}`, 'PNG', 0, 0, 210, 297);
  return new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer);
}
