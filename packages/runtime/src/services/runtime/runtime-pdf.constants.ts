export const RUNTIME_PDF = {
  extension: /\.pdf$/iu,
  timeoutSeconds: 60,
  maxOutputBytes: 16 * 1024,
  missingExitCode: 127,
  description: ' A PDF is read as its extracted text (pdftotext), with offset and limit counting its lines; pages are separated by form feeds.',
  read: (pages: string) => `Read the PDF's text layer (${pages} pages) with pdftotext.`,
  missing: 'This PDF cannot be read here: pdftotext (poppler-utils) is not installed in this environment.',
  encrypted: 'This PDF is password-protected, so its text cannot be read. Ask the person for a copy without a password.',
  timedOut: (seconds: number) => `This PDF took longer than ${seconds} seconds to read, so it was stopped. It may be very large or built to be slow; ask the person for a smaller copy or just the pages that matter.`,
  damaged: (reason: string) => `This PDF could not be opened (${reason}). It may be damaged or not a PDF; ask the person to export it again.`,
  scanned: (pages: string, path: string) => (
    `This PDF (${pages} pages) has no text layer: it is probably scanned. To see its pages, render them as images and read those, a few at a time: pdftoppm -png -r 100 -f 1 -l 3 '${path.replaceAll("'", "'\\''")}' /tmp/page`
  ),
} as const;
