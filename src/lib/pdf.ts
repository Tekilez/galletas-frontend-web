import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  summaryBoxes?: { label: string; value: string }[];
  showSignatures?: boolean;
}

/**
 * Sanitizes strings for jsPDF standard fonts so no unicode characters
 * (like arrows ➔, middle dots ·, smart quotes “”, em-dashes —) get corrupted into mojibake.
 */
function sanitizeForPdf(val: any): string {
  if (val === null || val === undefined) return "-";
  let str = String(val);
  return str
    .replace(/[➔➜→➤]/g, " -> ")
    .replace(/[·•]/g, " - ")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

export function exportToPdf({
  title,
  subtitle,
  filename,
  headers,
  rows,
  summaryBoxes,
  showSignatures = false,
}: PdfReportOptions) {
  // Use landscape if more than 5 columns so data doesn't get squeezed
  const isWide = headers.length >= 6;
  const doc = new jsPDF({
    orientation: isWide ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Header Banner
  doc.setFillColor(30, 27, 75); // Dark Indigo #1E1B4B
  doc.rect(0, 0, pageWidth, 24, "F");

  // Logo / Brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("KADEX TIENDA", 14, 11);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 225);
  doc.text("SISTEMA DE GESTION Y KARDEX", 14, 18);

  // Document Title & Date on Right
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(sanitizeForPdf(title).toUpperCase(), pageWidth - 14, 11, { align: "right" });

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 225);
  const dateStr = `Emision: ${new Date().toLocaleDateString("es-PE")} ${new Date().toLocaleTimeString("es-PE")}`;
  doc.text(dateStr, pageWidth - 14, 18, { align: "right" });

  let startY = 30;

  // 2. Subtitle
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(sanitizeForPdf(subtitle), 14, startY);
    startY += 6;
  }

  // 3. KPI Summary Boxes (if provided)
  if (summaryBoxes && summaryBoxes.length > 0) {
    const boxCount = summaryBoxes.length;
    const margin = 14;
    const totalAvailableWidth = pageWidth - margin * 2;
    const boxGap = 4;
    const boxWidth = (totalAvailableWidth - boxGap * (boxCount - 1)) / boxCount;
    const boxHeight = 13;

    summaryBoxes.forEach((box, i) => {
      const x = margin + i * (boxWidth + boxGap);
      const y = startY;

      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(203, 213, 225); // slate-300
      doc.roundedRect(x, y, boxWidth, boxHeight, 1.5, 1.5, "FD");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(sanitizeForPdf(box.label).toUpperCase(), x + 3.5, y + 4.5);

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(sanitizeForPdf(box.value), x + 3.5, y + 10);
    });

    startY += boxHeight + 6;
  }

  // Sanitize headers and rows
  const cleanHeaders = headers.map(sanitizeForPdf);
  const cleanRows = rows.map((r) => r.map(sanitizeForPdf));

  // Determine column alignment rules
  const columnStyles: Record<number, any> = {};
  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    if (lower.includes("total") || lower.includes("costo") || lower.includes("precio") || lower.includes("(s/)") || lower.includes("ingreso")) {
      columnStyles[idx] = { halign: "right", fontStyle: "bold" };
    } else if (lower.includes("cant") || lower.includes("stock") || lower.includes("uds") || lower.includes("fecha")) {
      columnStyles[idx] = { halign: "center" };
    } else {
      columnStyles[idx] = { halign: "left" };
    }
  });

  // 4. Main Styled Table
  autoTable(doc, {
    startY: startY,
    head: [cleanHeaders],
    body: cleanRows,
    theme: "striped",
    headStyles: {
      fillColor: [67, 56, 202], // Indigo 700 #4338CA
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: columnStyles,
    styles: {
      overflow: "linebreak",
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Footer page numbers
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 150, 150);
      const pageStr = `Pagina ${doc.getNumberOfPages()}`;
      doc.text(pageStr, pageWidth - 14, pageHeight - 6, { align: "right" });
      doc.text("Reporte generado por Kadex Tienda", 14, pageHeight - 6);
    },
  });

  // 5. Signatures (Optional)
  if (showSignatures) {
    const finalY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : startY + 40;
    if (finalY < pageHeight - 25) {
      doc.setDrawColor(80, 80, 80);
      doc.line(30, finalY, 90, finalY);
      doc.line(pageWidth - 90, finalY, pageWidth - 30, finalY);

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(60, 60, 60);
      doc.text("Firma Vendedora / Responsable", 60, finalY + 4.5, { align: "center" });
      doc.text("Firma Administracion", pageWidth - 60, finalY + 4.5, { align: "center" });
    }
  }

  // 6. Download file
  const cleanFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  doc.save(cleanFilename);
}

import JsBarcode from "jsbarcode";

export function exportBarcodeLabelsPdf(variants: { sku: string; nombre: string; precio: number }[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  
  const cols = 3;
  const rowsPerPage = 7;
  const labelWidth = 62;
  const labelHeight = 42;
  
  const marginX = (pageWidth - (cols * labelWidth)) / (cols + 1);
  const marginY = 12;
  
  let currentItem = 0;
  
  while (currentItem < variants.length) {
    if (currentItem > 0) doc.addPage();
    
    for (let row = 0; row < rowsPerPage; row++) {
      for (let col = 0; col < cols; col++) {
        if (currentItem >= variants.length) break;
        
        const item = variants[currentItem];
        const x = marginX + col * (labelWidth + marginX);
        const y = marginY + row * (labelHeight + 6);
        
        // Label border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.rect(x, y, labelWidth, labelHeight);
        
        // Store Name / Brand
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(30, 27, 75);
        doc.text("KADEX TIENDA", x + labelWidth / 2, y + 6, { align: "center" });
        
        // Product Name (truncated)
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        const cleanName = sanitizeForPdf(item.nombre).substring(0, 35);
        doc.text(cleanName, x + labelWidth / 2, y + 12, { align: "center" });
        
        // Price
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`S/ ${item.precio.toFixed(2)}`, x + labelWidth / 2, y + 18, { align: "center" });
        
        // Barcode - larger, higher quality, with quiet zone
        try {
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, item.sku, {
            format: "CODE128",
            displayValue: true,
            fontSize: 18,
            font: "monospace",
            height: 80,
            margin: 10,
            width: 2,
            background: "#ffffff",
            lineColor: "#000000",
          });
          const barcodeImg = canvas.toDataURL("image/png", 1.0);
          const barcodeWidth = labelWidth - 12;
          const barcodeHeight = 18;
          const barcodeX = x + 6;
          const barcodeY = y + 22;
          doc.addImage(barcodeImg, "PNG", barcodeX, barcodeY, barcodeWidth, barcodeHeight);
          
          // SKU text below barcode for manual entry
          doc.setFont("courier", "bold");
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 80);
          doc.text(item.sku, x + labelWidth / 2, barcodeY + barcodeHeight + 4, { align: "center" });
        } catch (e) {
          // Fallback if barcode fails (e.g. invalid characters in SKU)
          doc.setFont("courier", "bold");
          doc.setFontSize(9);
          doc.text(`*${item.sku}*`, x + labelWidth / 2, y + 32, { align: "center" });
        }
        
        currentItem++;
      }
    }
  }

  doc.save("etiquetas_inventario.pdf");
}

