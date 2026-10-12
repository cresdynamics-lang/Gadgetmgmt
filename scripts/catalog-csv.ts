export type CatalogRow = {
  category: string;
  itemId: string;
  group: string;
  product: string;
  configuration: string;
  newPrice: number;
  exUkPrice: number;
  notes: string;
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Catalog CSV contains an unclosed quoted field.");
  row.push(value);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function parseCatalog(text: string): CatalogRow[] {
  const [headerRow, ...dataRows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!headerRow) throw new Error("Catalog CSV is empty.");
  const headers = headerRow.map((header) => header.trim());
  const column = (name: string) => {
    const position = headers.indexOf(name);
    if (position < 0) throw new Error(`Catalog CSV is missing the required column: ${name}`);
    return position;
  };
  const columns = {
    category: column("Category"),
    itemId: column("Item ID"),
    group: column("Group"),
    product: column("Product"),
    configuration: column("Configuration / Spec"),
    newPrice: column("Price NEW (KES)"),
    exUkPrice: column("Price EX-UK (KES)"),
    notes: column("Notes"),
  };
  const ids = new Set<string>();

  return dataRows.map((cells, rowIndex) => {
    const rowNumber = rowIndex + 2;
    if (cells.length !== headers.length) throw new Error(`Catalog CSV row ${rowNumber} has ${cells.length} fields; expected ${headers.length}.`);
    const get = (position: number) => cells[position].trim();
    const itemId = get(columns.itemId);
    const newPriceText = get(columns.newPrice);
    const exUkPriceText = get(columns.exUkPrice);
    if (!itemId || ids.has(itemId)) throw new Error(`Catalog item ID is empty or duplicated on CSV row ${rowNumber}.`);
    ids.add(itemId);
    if (!get(columns.category) || !get(columns.product)) throw new Error(`Catalog category and product are required on CSV row ${rowNumber}.`);
    if (!/^\d+$/.test(newPriceText) || !/^\d+$/.test(exUkPriceText)) {
      throw new Error(`Catalog prices must be whole KES integers on CSV row ${rowNumber}.`);
    }
    const newPrice = Number(newPriceText);
    const exUkPrice = Number(exUkPriceText);
    if (!Number.isSafeInteger(newPrice) || !Number.isSafeInteger(exUkPrice) || newPrice < 1 || exUkPrice < 1 || newPrice > 2_147_483_647 || exUkPrice > 2_147_483_647) {
      throw new Error(`Catalog prices must be positive PostgreSQL integer values on CSV row ${rowNumber}.`);
    }

    return {
      category: get(columns.category),
      itemId,
      group: get(columns.group),
      product: get(columns.product),
      configuration: get(columns.configuration),
      newPrice,
      exUkPrice,
      notes: get(columns.notes),
    };
  });
}