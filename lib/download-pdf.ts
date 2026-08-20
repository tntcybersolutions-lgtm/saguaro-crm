/**
 * iOS-compatible PDF download utility.
 * Uses blob + anchor pattern which works on iOS Safari, Android, and desktop.
 * window.open(url) and window.location.href do NOT work on iOS Safari for PDF downloads.
 */
export async function downloadPDF(pdfUrl: string, filename: string): Promise<void> {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }, 100);
}
