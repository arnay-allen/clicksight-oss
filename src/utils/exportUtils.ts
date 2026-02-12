import { message } from 'antd';

type Html2Canvas = typeof import('html2canvas')['default'];
type JsPDFConstructor = typeof import('jspdf').jsPDF;
type JSZipConstructor = typeof import('jszip');

let html2canvasPromise: Promise<Html2Canvas> | null = null;
let jsPDFPromise: Promise<JsPDFConstructor> | null = null;
let jsZipPromise: Promise<JSZipConstructor> | null = null;

const loadHtml2Canvas = async (): Promise<Html2Canvas> => {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas').then((module) => module.default as Html2Canvas);
  }
  return html2canvasPromise;
};

const loadJsPDF = async (): Promise<JsPDFConstructor> => {
  if (!jsPDFPromise) {
    jsPDFPromise = import('jspdf').then((module) => (module.jsPDF || module.default) as JsPDFConstructor);
  }
  return jsPDFPromise;
};

const loadJSZip = async (): Promise<JSZipConstructor> => {
  if (!jsZipPromise) {
    jsZipPromise = import('jszip').then((module) => (module as unknown as { default?: JSZipConstructor }).default ?? (module as unknown as JSZipConstructor));
  }
  return jsZipPromise;
};

/**
 * Export a DOM element as PNG
 */
export async function exportToPNG(element: HTMLElement, filename: string = 'chart.png'): Promise<void> {
  try {
    message.loading({ content: 'Generating PNG...', key: 'export', duration: 0 });
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(element, {
      backgroundColor: '#0a0a0a',
      scale: 2, // Higher quality
      logging: false,
    });

    // Convert canvas to blob and download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success({ content: 'PNG exported successfully!', key: 'export' });
      } else {
        throw new Error('Failed to create blob');
      }
    });
  } catch (error: any) {
    console.error('Error exporting PNG:', error);
    message.error({ content: `Failed to export PNG: ${error.message}`, key: 'export' });
  }
}

/**
 * Export a DOM element as JPG
 */
export async function exportToJPG(element: HTMLElement, filename: string = 'chart.jpg'): Promise<void> {
  try {
    message.loading({ content: 'Generating JPG...', key: 'export', duration: 0 });
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(element, {
      backgroundColor: '#0a0a0a',
      scale: 2,
      logging: false,
    });

    // Convert canvas to blob and download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success({ content: 'JPG exported successfully!', key: 'export' });
      } else {
        throw new Error('Failed to create blob');
      }
    }, 'image/jpeg', 0.95);
  } catch (error: any) {
    console.error('Error exporting JPG:', error);
    message.error({ content: `Failed to export JPG: ${error.message}`, key: 'export' });
  }
}

/**
 * Export a DOM element as PDF
 */
export async function exportToPDF(element: HTMLElement, filename: string = 'chart.pdf', orientation: 'portrait' | 'landscape' = 'landscape'): Promise<void> {
  try {
    message.loading({ content: 'Generating PDF...', key: 'export', duration: 0 });
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(element, {
      backgroundColor: '#0a0a0a',
      scale: 2,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const JsPDF = await loadJsPDF();
    const pdf = new JsPDF({
      orientation: orientation,
      unit: 'px',
      format: [canvas.width, canvas.height],
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(filename);
    
    message.success({ content: 'PDF exported successfully!', key: 'export' });
  } catch (error: any) {
    console.error('Error exporting PDF:', error);
    message.error({ content: `Failed to export PDF: ${error.message}`, key: 'export' });
  }
}

/**
 * Export data to CSV
 */
export function exportToCSV(data: any[], filename: string = 'data.csv', headers?: string[]): void {
  try {
    message.loading({ content: 'Generating CSV...', key: 'export', duration: 0 });
    
    if (data.length === 0) {
      message.warning({ content: 'No data to export', key: 'export' });
      return;
    }

    // Get headers from data if not provided
    const csvHeaders = headers || Object.keys(data[0]);
    
    // Build CSV content
    const csvContent = [
      csvHeaders.join(','), // Header row
      ...data.map(row => 
        csvHeaders.map(header => {
          const value = row[header];
          // Escape commas and quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? '';
        }).join(',')
      )
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    message.success({ content: 'CSV exported successfully!', key: 'export' });
  } catch (error: any) {
    console.error('Error exporting CSV:', error);
    message.error({ content: `Failed to export CSV: ${error.message}`, key: 'export' });
  }
}

/**
 * Export entire dashboard as single-page PDF (screenshot style)
 */
export async function exportDashboardToPDF(
  dashboardElement: HTMLElement,
  dashboardName: string
): Promise<void> {
  try {
    message.loading({ content: 'Generating Dashboard PDF...', key: 'dashboard-export', duration: 0 });

    // Capture entire dashboard as canvas
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(dashboardElement, {
      backgroundColor: '#0a0a0a',
      scale: 2,
      logging: false,
      width: dashboardElement.scrollWidth,
      height: dashboardElement.scrollHeight,
      windowWidth: dashboardElement.scrollWidth,
      windowHeight: dashboardElement.scrollHeight,
    });

    // Create PDF with custom dimensions matching the canvas
    const imgData = canvas.toDataURL('image/png');
    const JsPDF = await loadJsPDF();
    const pdf = new JsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height],
    });

    // Add image to PDF
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);

    // Save PDF
    const filename = `${dashboardName.replace(/[^a-z0-9]/gi, '_')}_dashboard.pdf`;
    pdf.save(filename);

    message.success({ content: 'Dashboard PDF exported successfully!', key: 'dashboard-export' });
  } catch (error: any) {
    console.error('Error exporting dashboard to PDF:', error);
    message.error({ content: `Failed to export PDF: ${error.message}`, key: 'dashboard-export' });
  }
}

/**
 * Export entire dashboard as single PNG image
 */
export async function exportDashboardToPNG(
  dashboardElement: HTMLElement,
  dashboardName: string
): Promise<void> {
  try {
    message.loading({ content: 'Generating Dashboard PNG...', key: 'dashboard-export', duration: 0 });

    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(dashboardElement, {
      backgroundColor: '#0a0a0a',
      scale: 2,
      logging: false,
      width: dashboardElement.scrollWidth,
      height: dashboardElement.scrollHeight,
      windowWidth: dashboardElement.scrollWidth,
      windowHeight: dashboardElement.scrollHeight,
    });

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${dashboardName.replace(/[^a-z0-9]/gi, '_')}_dashboard.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        message.success({ content: 'Dashboard PNG exported successfully!', key: 'dashboard-export' });
      } else {
        throw new Error('Failed to create blob');
      }
    });
  } catch (error: any) {
    console.error('Error exporting dashboard to PNG:', error);
    message.error({ content: `Failed to export PNG: ${error.message}`, key: 'dashboard-export' });
  }
}

/**
 * Export dashboard charts data as ZIP containing individual CSV files
 */
export async function exportDashboardToCSV(
  dashboardName: string,
  chartsData: Array<{ name: string; data: any[]; headers?: string[] }>
): Promise<void> {
  try {
    message.loading({ content: 'Generating Dashboard CSV...', key: 'dashboard-export', duration: 0 });

    if (chartsData.length === 0) {
      message.warning({ content: 'No chart data to export', key: 'dashboard-export' });
      return;
    }

    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const csvFolder = zip.folder(dashboardName.replace(/[^a-z0-9]/gi, '_'));

    if (!csvFolder) {
      throw new Error('Failed to create ZIP folder');
    }

    // Add each chart as a CSV file
    chartsData.forEach(({ name, data, headers }, index) => {
      if (data.length === 0) {
        // Add empty file with note
        csvFolder.file(
          `${index + 1}_${name.replace(/[^a-z0-9]/gi, '_')}.txt`,
          'No data available for this chart'
        );
        return;
      }

      // Get headers
      const csvHeaders = headers || Object.keys(data[0]);

      // Build CSV content
      const csvContent = [
        csvHeaders.join(','), // Header row
        ...data.map((row) =>
          csvHeaders
            .map((header) => {
              const value = row[header];
              // Escape commas and quotes
              if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value ?? '';
            })
            .join(',')
        ),
      ].join('\n');

      // Add to ZIP
      csvFolder.file(`${index + 1}_${name.replace(/[^a-z0-9]/gi, '_')}.csv`, csvContent);
    });

    // Add README
    const readme = `Dashboard Export: ${dashboardName}
Generated on: ${new Date().toLocaleString()}
Total Charts: ${chartsData.length}

Files:
${chartsData.map((c, i) => `  ${i + 1}_${c.name.replace(/[^a-z0-9]/gi, '_')}.csv - ${c.name}`).join('\n')}
`;
    csvFolder.file('README.txt', readme);

    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dashboardName.replace(/[^a-z0-9]/gi, '_')}_data.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success({ content: 'Dashboard CSV exported successfully!', key: 'dashboard-export' });
  } catch (error: any) {
    console.error('Error exporting dashboard to CSV:', error);
    message.error({ content: `Failed to export CSV: ${error.message}`, key: 'dashboard-export' });
  }
}

