"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { groupWebsiteUpdateRows, type WebsiteUpdateRow } from "@/lib/inventory-update";

type UpdateItem = {
  stockOnHand: number;
  reservedStock: number;
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    condition: string;
    colour: string | null;
    configuration: string | null;
    productGroup: string | null;
    sellingPrice: number;
    websiteProductId: string | null;
    websiteVariantKey: string | null;
  };
};

type Draft = {
  newPrice: string;
  exUkPrice: string;
};

type Props = {
  items: UpdateItem[];
  canEditPrices: boolean;
  onSaved: () => Promise<void> | void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  title?: string;
  description?: string;
};

export type { UpdateItem };

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

function draftFrom(row: WebsiteUpdateRow): Draft {
  return {
    newPrice: row.new ? String(row.new.sellingPrice) : "",
    exUkPrice: row.exUk ? String(row.exUk.sellingPrice) : "",
  };
}

export function InventoryUpdate({ items, canEditPrices, onSaved, onError, onNotice, title = "Update", description = "New and Ex-UK selling prices for this branch." }: Props) {
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingKey, setSavingKey] = useState("");

  const rows = useMemo(
    () =>
      groupWebsiteUpdateRows(
        items.map((item) => ({
          id: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          category: item.product.category,
          condition: item.product.condition,
          colour: item.product.colour,
          configuration: item.product.configuration,
          productGroup: item.product.productGroup,
          sellingPrice: item.product.sellingPrice,
          websiteProductId: item.product.websiteProductId,
          websiteVariantKey: item.product.websiteVariantKey,
          stockOnHand: item.stockOnHand,
          reservedStock: item.reservedStock,
        })),
      ),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!q) return true;
      return `${row.name} ${row.group} ${row.option} ${row.new?.sku ?? ""} ${row.exUk?.sku ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, query]);

  function draftFor(row: WebsiteUpdateRow) {
    return drafts[row.key] ?? draftFrom(row);
  }

  async function saveRow(row: WebsiteUpdateRow) {
    if (!canEditPrices) return;
    const draft = draftFor(row);
    const newPrice = draft.newPrice.trim() ? Math.trunc(Number(draft.newPrice)) : null;
    const exUkPrice = draft.exUkPrice.trim() ? Math.trunc(Number(draft.exUkPrice)) : null;
    if (newPrice != null && !(newPrice > 0)) {
      onError("Enter a valid New price in KES.");
      return;
    }
    if (exUkPrice != null && !(exUkPrice > 0)) {
      onError("Enter a valid Ex-UK price in KES.");
      return;
    }
    if (newPrice == null && exUkPrice == null) {
      onError("Enter a New or Ex-UK price before saving.");
      return;
    }
    setSavingKey(row.key);
    onError("");
    onNotice("");
    try {
      const response = await fetch("/api/inventory/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteProductId: row.websiteProductId,
          websiteVariantKey: row.websiteVariantKey,
          newProductId: row.new?.productIds[0],
          exUkProductId: row.exUk?.productIds[0],
          ...(newPrice != null ? { newPrice } : {}),
          ...(exUkPrice != null ? { exUkPrice } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The listing could not be saved.");
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      await onSaved();
      onNotice(`${result.name || row.name} saved in operations. The public shop is not updated.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "The listing could not be saved.");
    } finally {
      setSavingKey("");
    }
  }

  return (
    <section id="inventory-update" className="inventory-update-panel overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ebe8] p-3.5">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[#7e897f]">{description}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" />
            <input aria-label="Search prices" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by name or SKU" className="w-full border border-[#c4c4c4] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#1a1a1a]" />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Option</th>
              <th className="px-4 py-3 font-medium">New (KES)</th>
              <th className="px-4 py-3 font-medium">Ex-UK (KES)</th>
              <th className="px-4 py-3 text-right font-medium">New stock</th>
              <th className="px-4 py-3 text-right font-medium">Ex-UK stock</th>
              {canEditPrices ? <th className="px-4 py-3"><span className="sr-only">Save</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e5e5]">
            {filtered.map((row) => {
              const draft = draftFor(row);
              return (
                <tr key={row.key} className="hover:bg-[#f5f5f5]">
                  <td className="px-4 py-3">
                    <strong className="font-medium">{row.name}</strong>
                    <div className="mt-1 text-[10px] text-[#69746c]">{row.group}</div>
                  </td>
                  <td className="px-4 py-3 text-[#69746c]">{row.option}</td>
                  <td className="px-4 py-3">
                    {canEditPrices ? (
                      <input
                        aria-label={`New price for ${row.name}`}
                        type="number"
                        min={1}
                        step={500}
                        value={draft.newPrice}
                        onChange={(event) => setDrafts((current) => ({ ...current, [row.key]: { ...draft, newPrice: event.target.value } }))}
                        placeholder={row.new ? undefined : "Add New"}
                        className="h-10 w-28 rounded-lg border border-[#c4c4c4] px-2 text-right text-sm"
                      />
                    ) : row.new ? money(row.new.sellingPrice) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {canEditPrices ? (
                      <input
                        aria-label={`Ex-UK price for ${row.name}`}
                        type="number"
                        min={1}
                        step={500}
                        value={draft.exUkPrice}
                        onChange={(event) => setDrafts((current) => ({ ...current, [row.key]: { ...draft, exUkPrice: event.target.value } }))}
                        placeholder={row.exUk ? undefined : "Add Ex-UK"}
                        className="h-10 w-28 rounded-lg border border-[#c4c4c4] px-2 text-right text-sm"
                      />
                    ) : row.exUk ? money(row.exUk.sellingPrice) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.new?.available ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.exUk?.available ?? 0}</td>
                  {canEditPrices ? (
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <button type="button" disabled={savingKey === row.key} onClick={() => void saveRow(row)} className="min-h-10 rounded-lg bg-[#111111] px-3 text-xs font-semibold text-white disabled:opacity-50">
                        {savingKey === row.key ? "Saving…" : "Save"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={canEditPrices ? 7 : 6} className="px-4 py-9 text-center text-sm text-[#69746c]">
                  {rows.length ? "No matching New / Ex-UK listings." : "No New or Ex-UK products to update yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
