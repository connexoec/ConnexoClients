/**
 * Escritor de archivos Excel (.xlsx) SIN DEPENDENCIAS.
 *
 * Por qué escrito a mano y no con una librería: un .xlsx es un ZIP con unos
 * pocos XML dentro, y meter `xlsx`/`exceljs` (cientos de KB) al bundle para una
 * pantalla de administración es exactamente lo que este proyecto evitó en
 * v0.43.0 al resolver la importación con CSV. Aquí se genera el ZIP a mano:
 * ~6 KB de código y cero dependencias nuevas.
 *
 * Decisiones:
 *  - Entradas ZIP **sin comprimir** (método "stored"). Un ZIP stored es
 *    perfectamente válido y lo abren Excel, Google Sheets y LibreOffice; usar
 *    deflate obligaría a `CompressionStream` (async, no disponible en todos los
 *    navegadores) a cambio de nada que el usuario note.
 *  - Cadenas **en línea** (`t="inlineStr"`) en vez de `sharedStrings.xml`: una
 *    parte menos que pueda quedar descuadrada con el resto.
 *  - Los números van como número real (`t` omitido) para que Excel pueda
 *    sumarlos; todo lo demás va como texto, que es lo correcto para códigos y
 *    teléfonos (si "0987654321" fuera número, Excel se comería el cero).
 */

export type CellValue = string | number | null | undefined;

// ── XML ────────────────────────────────────────────────────────────────────
/**
 * Escapa para XML y **descarta los caracteres de control**: Excel rechaza el
 * archivo entero si aparece un 0x00–0x1F que no sea tab/salto de línea, y una
 * nota escrita por un cliente puede traer cualquier cosa pegada.
 */
const xmlText = (value: string): string =>
  value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const xmlAttr = (value: string): string => xmlText(value).replace(/"/g, '&quot;');

/** 1 → A, 26 → Z, 27 → AA … (un formulario con muchos campos pasa de la Z). */
export const columnLetter = (index: number): string => {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || 'A';
};

/** Excel no admite : \ / ? * [ ] en el nombre de la hoja, ni más de 31 chars. */
const safeSheetName = (name: string): string => {
  const clean = (name || 'Hoja1').replace(/[:\\/?*[\]]/g, ' ').trim();
  return (clean || 'Hoja1').slice(0, 31);
};

const isNumeric = (value: CellValue): value is number =>
  typeof value === 'number' && isFinite(value);

const cellXml = (ref: string, value: CellValue, styleId: number): string => {
  const s = styleId ? ` s="${styleId}"` : '';
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${s}/>`;
  if (isNumeric(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(String(value))}</t></is></c>`;
};

// ── Partes del paquete ─────────────────────────────────────────────────────
const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

/**
 * Estilos mínimos válidos. Los rellenos 0 y 1 (none y gray125) son
 * obligatorios en ese orden: Excel da el archivo por corrupto si faltan.
 * Estilo 1 = cabecera (negrita sobre fondo oscuro).
 */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2">' +
  '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const workbookXml = (sheetName: string): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  `<sheets><sheet name="${xmlAttr(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
  '</workbook>';

/** Ancho de columna estimado por el contenido, acotado para que quepa en pantalla. */
const guessWidth = (header: string, rows: CellValue[][], colIndex: number): number => {
  let longest = header.length;
  for (const row of rows) {
    const value = row[colIndex];
    if (value === null || value === undefined) continue;
    const len = String(value).length;
    if (len > longest) longest = len;
    if (longest >= 46) break;
  }
  return Math.min(Math.max(longest + 2, 9), 46);
};

const sheetXml = (headers: string[], rows: CellValue[][]): string => {
  const lastCol = columnLetter(headers.length);
  const lastRow = rows.length + 1;

  const cols = headers
    .map((h, i) => `<col min="${i + 1}" max="${i + 1}" width="${guessWidth(h, rows, i)}" customWidth="1"/>`)
    .join('');

  const headerRow =
    '<row r="1" ht="20" customHeight="1">' +
    headers.map((h, i) => cellXml(`${columnLetter(i + 1)}1`, h, 1)).join('') +
    '</row>';

  const bodyRows = rows
    .map((row, r) => {
      const rowNum = r + 2;
      const cells = headers
        .map((_, c) => cellXml(`${columnLetter(c + 1)}${rowNum}`, row[c], 0))
        .join('');
      return `<row r="${rowNum}">${cells}</row>`;
    })
    .join('');

  // El orden de los elementos importa: el esquema exige
  // dimension → sheetViews → cols → sheetData → autoFilter.
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${headerRow}${bodyRows}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
    '</worksheet>'
  );
};

// ── ZIP ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

interface ZipEntry { name: string; data: Uint8Array; }

/** Fecha/hora en el formato de 16 bits que usa MS-DOS (lo que espera el ZIP). */
const dosDateTime = (date: Date): { time: number; date: number } => {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
};

/** Empaqueta las entradas en un ZIP "stored" (sin compresión). */
const zip = (entries: ZipEntry[]): Uint8Array => {
  const stamp = dosDateTime(new Date());
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = utf8(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length + size);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // firma de cabecera local
    lv.setUint16(4, 20, true);           // versión necesaria
    lv.setUint16(6, 0x0800, true);       // bandera: nombre en UTF-8
    lv.setUint16(8, 0, true);            // método 0 = stored
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);        // tamaño comprimido
    lv.setUint32(22, size, true);        // tamaño original
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // sin campo extra
    local.set(nameBytes, 30);
    local.set(entry.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);   // firma de directorio central
    cv.setUint16(4, 20, true);           // versión del creador
    cv.setUint16(6, 20, true);           // versión necesaria
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra
    cv.setUint16(32, 0, true);           // comentario
    cv.setUint16(34, 0, true);           // disco
    cv.setUint16(36, 0, true);           // atributos internos
    cv.setUint32(38, 0, true);           // atributos externos
    cv.setUint32(42, offset, true);      // posición de la cabecera local
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);     // fin del directorio central
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
  return out;
};

// ── API pública ────────────────────────────────────────────────────────────
export interface SheetData {
  sheetName: string;
  headers: string[];
  rows: CellValue[][];
}

/** Devuelve los bytes de un .xlsx de una sola hoja. */
export const buildXlsx = ({ sheetName, headers, rows }: SheetData): Uint8Array => {
  const name = safeSheetName(sheetName);
  const safeHeaders = headers.length > 0 ? headers : ['(sin columnas)'];
  return zip([
    { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
    { name: '_rels/.rels', data: utf8(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: utf8(workbookXml(name)) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: utf8(STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: utf8(sheetXml(safeHeaders, rows)) },
  ]);
};

/** Mismos datos en CSV, como respaldo universal (Excel lo abre igual). */
export const buildCsv = ({ headers, rows }: Pick<SheetData, 'headers' | 'rows'>): string => {
  const cell = (value: CellValue): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(cell).join(','), ...rows.map(r => headers.map((_, i) => cell(r[i])).join(','))].join('\r\n');
};

/** Dispara la descarga de un blob con el nombre indicado. */
export const downloadBlob = (filename: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // El revoke inmediato aborta la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const downloadXlsx = (filename: string, sheet: SheetData): void => {
  const bytes = buildXlsx(sheet);
  downloadBlob(filename, new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
};

export const downloadCsvFile = (filename: string, sheet: Pick<SheetData, 'headers' | 'rows'>): void => {
  // El BOM es lo que hace que Excel lea los acentos correctamente.
  downloadBlob(filename, new Blob(['\uFEFF' + buildCsv(sheet)], { type: 'text/csv;charset=utf-8;' }));
};
