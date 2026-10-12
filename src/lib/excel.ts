import ExcelJS from "exceljs";

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "center" | "right";
  isCurrency?: boolean;
  isNumber?: boolean;
}

export async function exportStyledExcel(
  filename: string,
  title: string,
  columns: ExcelColumn[],
  data: Record<string, any>[],
  totals?: Record<string, number>
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kadex Tienda";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title.slice(0, 30), {
    views: [{ showGridLines: true }],
  });

  // 1. Title Banner
  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `KADEX · ${title.toUpperCase()}`;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E1B4B" }, // Dark Indigo
  };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 36;

  // Subtitle / Date
  sheet.mergeCells(2, 1, 2, columns.length);
  const subCell = sheet.getCell(2, 1);
  subCell.value = `Generado el: ${new Date().toLocaleDateString("es-PE")} a las ${new Date().toLocaleTimeString("es-PE")} · Sistema de Inventario y Kardex`;
  subCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF6B7280" } };
  subCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(2).height = 20;

  // Empty spacer row
  sheet.getRow(3).height = 8;

  // 2. Table Headers (Row 4)
  const headerRow = sheet.getRow(4);
  headerRow.height = 26;

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4338CA" }, // Indigo 700
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: col.align || (col.isCurrency || col.isNumber ? "right" : "left"),
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF312E81" } },
      left: { style: "thin", color: { argb: "FF312E81" } },
      bottom: { style: "medium", color: { argb: "FF312E81" } },
      right: { style: "thin", color: { argb: "FF312E81" } },
    };
  });

  // 3. Data Rows
  let currentRowIndex = 5;
  data.forEach((rowObj, rIdx) => {
    const row = sheet.getRow(currentRowIndex);
    row.height = 22;
    const isEven = rIdx % 2 === 0;

    columns.forEach((col, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      const val = rowObj[col.key];

      if (col.isCurrency) {
        cell.value = typeof val === "number" ? val : Number(val) || 0;
        cell.numFmt = '"S/ "#,##0.00';
      } else if (col.isNumber) {
        cell.value = typeof val === "number" ? val : Number(val) || 0;
        cell.numFmt = '#,##0';
      } else {
        cell.value = val ?? "—";
      }

      cell.font = { name: "Arial", size: 9.5 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFFFFFFF" : "FFF8FAFC" }, // Zebra white / slate-50
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: col.align || (col.isCurrency || col.isNumber ? "right" : "left"),
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    currentRowIndex++;
  });

  // 4. Totals Row (Optional)
  if (totals && Object.keys(totals).length > 0) {
    const totRow = sheet.getRow(currentRowIndex);
    totRow.height = 26;

    columns.forEach((col, cIdx) => {
      const cell = totRow.getCell(cIdx + 1);
      if (cIdx === 0) {
        cell.value = "TOTALES";
        cell.alignment = { vertical: "middle", horizontal: "left" };
      } else if (totals[col.key] !== undefined) {
        cell.value = totals[col.key];
        if (col.isCurrency) cell.numFmt = '"S/ "#,##0.00';
        else if (col.isNumber) cell.numFmt = '#,##0';
        cell.alignment = { vertical: "middle", horizontal: "right" };
      } else {
        cell.value = "";
      }

      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF0F172A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" }, // Slate 100
      };
      cell.border = {
        top: { style: "medium", color: { argb: "FF475569" } },
        bottom: { style: "double", color: { argb: "FF0F172A" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  }

  // 5. Calculate auto column widths
  columns.forEach((col, idx) => {
    let maxLen = col.header.length;
    data.forEach((row) => {
      const val = row[col.key];
      if (val !== undefined && val !== null) {
        const str = col.isCurrency ? `S/ ${Number(val).toFixed(2)}` : String(val);
        if (str.length > maxLen) maxLen = str.length;
      }
    });
    sheet.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 4, col.width || 12), 40);
  });

  // 6. Generate buffer and trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Simple fallback helper compatible with array of arrays
export function exportToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  const cols: ExcelColumn[] = headers.map((h, i) => ({
    header: h,
    key: `col_${i}`,
    isCurrency: h.toLowerCase().includes("(s/)") || h.toLowerCase().includes("total") || h.toLowerCase().includes("costo") || h.toLowerCase().includes("precio"),
    isNumber: h.toLowerCase().includes("cant") || h.toLowerCase().includes("stock") || h.toLowerCase().includes("prendas") || h.toLowerCase().includes("paquetes") || h.toLowerCase().includes("galletas") || h.toLowerCase().includes("uds"),
  }));

  const dataObj = rows.map((r) => {
    const obj: Record<string, any> = {};
    headers.forEach((_, i) => {
      obj[`col_${i}`] = r[i];
    });
    return obj;
  });

  exportStyledExcel(filename, sheetName, cols, dataObj);
}

export const exportToCsv = exportToExcel;
