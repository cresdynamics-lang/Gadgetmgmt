/**
 * Which iPad / Mac / AirPods / Watch / accessory SKUs can appear on gadgethubke.com.
 * Prices are not stored here. Live prices come from Product.sellingPrice in ops
 * and the website catalog overlay.
 */
export const WEBSITE_MANAGED_GROUPS = ["iPad", "Mac", "AirPods", "Watch", "Apple accessories"] as const;

export const WEBSITE_MANAGED_ACCESSORY_PREFIXES = ["pencil-", "keyboard-", "mouse-"] as const;

export type WebsiteCatalogListing = {
  group: string;
  category: "iPad" | "Mac" | "AirPods" | "Apple Watch" | "Apple accessories";
  name: string;
  configuration: string;
  websiteProductId: string;
  websiteVariantKey: string;
  /** False hides this listing from gadgethubke.com while keeping the ops row. */
  listed?: boolean;
};

export const websiteCatalogListings: WebsiteCatalogListing[] = [
  { group: "iPad Pro 11\" M5", category: "iPad", name: "iPad Pro 11\" M5 256GB 5G", configuration: "256GB · 5G", websiteProductId: "ipad-pro-11-m5", websiteVariantKey: "256gb-cell" },
  { group: "iPad Pro 11\" M5", category: "iPad", name: "iPad Pro 11\" M5 256GB Wi-Fi", configuration: "256GB · Wi-Fi", websiteProductId: "ipad-pro-11-m5", websiteVariantKey: "256gb" },
  { group: "iPad Pro 11\" M5", category: "iPad", name: "iPad Pro 11\" M5 512GB 5G", configuration: "512GB · 5G", websiteProductId: "ipad-pro-11-m5", websiteVariantKey: "512gb-cell" },
  { group: "iPad Pro 13\" M5", category: "iPad", name: "iPad Pro 13\" M5 256GB Wi-Fi", configuration: "256GB · Wi-Fi", websiteProductId: "ipad-pro-13-m5", websiteVariantKey: "256gb" },
  { group: "iPad Pro 13\" M5", category: "iPad", name: "iPad Pro 13\" M5 256GB 5G", configuration: "256GB · 5G", websiteProductId: "ipad-pro-13-m5", websiteVariantKey: "256gb-cell" },
  { group: "iPad Pro 13\" M5", category: "iPad", name: "iPad Pro 13\" M5 512GB 5G", configuration: "512GB · 5G", websiteProductId: "ipad-pro-13-m5", websiteVariantKey: "512gb-cell" },
  { group: "iPad Pro 13\" M5", category: "iPad", name: "iPad Pro 13\" M5 1TB 5G", configuration: "1TB · 5G", websiteProductId: "ipad-pro-13-m5", websiteVariantKey: "1tb-cell" },

  { group: "iPad Air 13\" M4", category: "iPad", name: "iPad Air 13\" M4 256GB Wi-Fi", configuration: "256GB · Wi-Fi", websiteProductId: "ipad-air-13-m4", websiteVariantKey: "256gb" },
  { group: "iPad Air 13\" M4", category: "iPad", name: "iPad Air 13\" M4 256GB 5G", configuration: "256GB · 5G", websiteProductId: "ipad-air-13-m4", websiteVariantKey: "256gb-cell" },
  { group: "iPad Air 13\" M4", category: "iPad", name: "iPad Air 13\" M4 128GB Wi-Fi", configuration: "128GB · Wi-Fi", websiteProductId: "ipad-air-13-m4", websiteVariantKey: "128gb" },
  { group: "iPad Air 13\" M4", category: "iPad", name: "iPad Air 13\" M4 128GB 5G", configuration: "128GB · 5G", websiteProductId: "ipad-air-13-m4", websiteVariantKey: "128gb-cell" },
  { group: "iPad Air 11\" M4", category: "iPad", name: "iPad Air 11\" M4 256GB Wi-Fi", configuration: "256GB · Wi-Fi", websiteProductId: "ipad-air-11-m4", websiteVariantKey: "256gb" },
  { group: "iPad Air 11\" M4", category: "iPad", name: "iPad Air 11\" M4 256GB 5G", configuration: "256GB · 5G", websiteProductId: "ipad-air-11-m4", websiteVariantKey: "256gb-cell" },
  { group: "iPad Air 11\" M4", category: "iPad", name: "iPad Air 11\" M4 128GB Wi-Fi", configuration: "128GB · Wi-Fi", websiteProductId: "ipad-air-11-m4", websiteVariantKey: "128gb" },
  { group: "iPad Air 11\" M4", category: "iPad", name: "iPad Air 11\" M4 128GB 5G", configuration: "128GB · 5G", websiteProductId: "ipad-air-11-m4", websiteVariantKey: "128gb-cell" },

  { group: "iPad A16", category: "iPad", name: "iPad A16 256GB Wi-Fi", configuration: "256GB · Wi-Fi", websiteProductId: "ipad-a16", websiteVariantKey: "256gb" },
  { group: "iPad A16", category: "iPad", name: "iPad A16 256GB 5G", configuration: "256GB · 5G", websiteProductId: "ipad-a16", websiteVariantKey: "256gb-cell" },
  { group: "iPad A16", category: "iPad", name: "iPad A16 128GB Wi-Fi", configuration: "128GB · Wi-Fi", websiteProductId: "ipad-a16", websiteVariantKey: "128gb" },
  { group: "iPad A16", category: "iPad", name: "iPad A16 128GB 5G", configuration: "128GB · 5G", websiteProductId: "ipad-a16", websiteVariantKey: "128gb-cell" },
  { group: "iPad mini A17", category: "iPad", name: "iPad mini A17 256GB 5G", configuration: "256GB · 5G", websiteProductId: "ipad-mini-a17-pro", websiteVariantKey: "256gb-cell" },
  { group: "iPad mini A17", category: "iPad", name: "iPad mini A17 128GB Wi-Fi", configuration: "128GB · Wi-Fi", websiteProductId: "ipad-mini-a17-pro", websiteVariantKey: "128gb" },
  { group: "iPad mini A17", category: "iPad", name: "iPad mini A17 128GB 5G", configuration: "128GB · 5G", websiteProductId: "ipad-mini-a17-pro", websiteVariantKey: "128gb-cell" },

  { group: "MacBook Air 13\" M5", category: "Mac", name: "MacBook Air 13\" M5 16/512GB", configuration: "16GB · 512GB", websiteProductId: "macbook-air-13-m5", websiteVariantKey: "16gb-512gb" },
  { group: "MacBook Air 13\" M5", category: "Mac", name: "MacBook Air 13\" M5 16/1TB", configuration: "16GB · 1TB", websiteProductId: "macbook-air-13-m5", websiteVariantKey: "16gb-1tb" },
  { group: "MacBook Air 15\" M5", category: "Mac", name: "MacBook Air 15\" M5 16/512GB", configuration: "16GB · 512GB", websiteProductId: "macbook-air-15-m5", websiteVariantKey: "16gb-512gb" },
  { group: "MacBook Air 15\" M5", category: "Mac", name: "MacBook Air 15\" M5 24/1TB", configuration: "24GB · 1TB", websiteProductId: "macbook-air-15-m5", websiteVariantKey: "24gb-1tb" },

  { group: "MacBook Neo 13\"", category: "Mac", name: "MacBook Neo 13\" 8/256GB", configuration: "8GB · 256GB", websiteProductId: "macbook-neo-13", websiteVariantKey: "8gb-256gb" },
  { group: "MacBook Neo 13\"", category: "Mac", name: "MacBook Neo 13\" 8/512GB", configuration: "8GB · 512GB", websiteProductId: "macbook-neo-13", websiteVariantKey: "8gb-512gb" },

  { group: "MacBook Pro 14\" M5", category: "Mac", name: "MacBook Pro 14\" M5 16/512GB", configuration: "16GB · 512GB", websiteProductId: "macbook-pro-14-m5", websiteVariantKey: "16gb-512gb" },
  { group: "MacBook Pro 14\" M5", category: "Mac", name: "MacBook Pro 14\" M5 16/1TB", configuration: "16GB · 1TB", websiteProductId: "macbook-pro-14-m5", websiteVariantKey: "16gb-1tb" },
  { group: "MacBook Pro 14\" M5", category: "Mac", name: "MacBook Pro 14\" M5 24/1TB", configuration: "24GB · 1TB", websiteProductId: "macbook-pro-14-m5", websiteVariantKey: "24gb-1tb" },
  { group: "MacBook Pro 16\" M5", category: "Mac", name: "MacBook Pro 16\" M5 36/1TB", configuration: "36GB · 1TB", websiteProductId: "macbook-pro-16-m5-pro", websiteVariantKey: "36gb-1tb" },

  { group: "AirPods Pro 3", category: "AirPods", name: "AirPods Pro 3", configuration: "", websiteProductId: "airpods-pro-3", websiteVariantKey: "base" },
  { group: "AirPods Pro 2", category: "AirPods", name: "AirPods Pro 2", configuration: "", websiteProductId: "airpods-pro-2", websiteVariantKey: "base" },
  { group: "AirPods 4 ANC", category: "AirPods", name: "AirPods 4 ANC", configuration: "", websiteProductId: "airpods-4-anc", websiteVariantKey: "base" },
  { group: "AirPods 4", category: "AirPods", name: "AirPods 4", configuration: "", websiteProductId: "airpods-4", websiteVariantKey: "base" },
  { group: "AirPods (3rd gen)", category: "AirPods", name: "AirPods (3rd gen)", configuration: "", websiteProductId: "airpods-3", websiteVariantKey: "base" },
  { group: "AirPods Max 2026 USB-C", category: "AirPods", name: "AirPods Max 2026 USB-C", configuration: "", websiteProductId: "airpods-max-2", websiteVariantKey: "base", listed: false },

  { group: "Apple Watch Series 12", category: "Apple Watch", name: "Apple Watch Series 12 46mm", configuration: "46mm", websiteProductId: "watch-s12-46", websiteVariantKey: "aluminum-gps" },
  { group: "Apple Watch Series 12", category: "Apple Watch", name: "Apple Watch Series 12 42mm", configuration: "42mm", websiteProductId: "watch-s12-42", websiteVariantKey: "aluminum-gps" },
  { group: "Apple Watch Series 11", category: "Apple Watch", name: "Apple Watch Series 11 46mm", configuration: "46mm", websiteProductId: "watch-s11-46", websiteVariantKey: "aluminum-gps" },
  { group: "Apple Watch Series 11", category: "Apple Watch", name: "Apple Watch Series 11 42mm", configuration: "42mm", websiteProductId: "watch-s11-42", websiteVariantKey: "aluminum-gps" },
  { group: "Apple Watch SE 3", category: "Apple Watch", name: "Apple Watch SE 3 44mm", configuration: "44mm", websiteProductId: "watch-se3-44", websiteVariantKey: "aluminum-gps" },
  { group: "Apple Watch SE 3", category: "Apple Watch", name: "Apple Watch SE 3 41mm", configuration: "41mm", websiteProductId: "watch-se3-40", websiteVariantKey: "aluminum-gps" },
  { group: "Apple Watch Ultra 2", category: "Apple Watch", name: "Apple Watch Ultra 2 49mm", configuration: "49mm", websiteProductId: "watch-ultra-2", websiteVariantKey: "titanium-cell" },
  { group: "Apple Watch Ultra 3", category: "Apple Watch", name: "Apple Watch Ultra 3 49mm", configuration: "49mm", websiteProductId: "watch-ultra-3", websiteVariantKey: "titanium-cell" },
  { group: "Apple Watch Ultra 4", category: "Apple Watch", name: "Apple Watch Ultra 4 49mm", configuration: "49mm", websiteProductId: "watch-ultra-4", websiteVariantKey: "titanium-cell" },

  { group: "Apple Pencil", category: "Apple accessories", name: "Apple Pencil 2nd gen", configuration: "", websiteProductId: "pencil-2", websiteVariantKey: "base" },
  { group: "Apple Pencil", category: "Apple accessories", name: "Apple Pencil USB-C", configuration: "", websiteProductId: "pencil-usbc", websiteVariantKey: "base" },
  { group: "Apple Pencil", category: "Apple accessories", name: "Apple Pencil Pro", configuration: "", websiteProductId: "pencil-pro", websiteVariantKey: "base" },
  { group: "iPad Air Keyboard", category: "Apple accessories", name: "Magic Keyboard Folio Air 13\"", configuration: "Air 13\"", websiteProductId: "keyboard-ipad-air-13", websiteVariantKey: "base" },
  { group: "iPad Air Keyboard", category: "Apple accessories", name: "Magic Keyboard Folio Air 11\"", configuration: "Air 11\"", websiteProductId: "keyboard-ipad-air-11", websiteVariantKey: "base" },
  { group: "Magic Keyboard", category: "Apple accessories", name: "Magic Keyboard 11\"", configuration: "11\"", websiteProductId: "keyboard-ipad-pro-11", websiteVariantKey: "base" },
  { group: "Magic Keyboard", category: "Apple accessories", name: "Magic Keyboard 13\"", configuration: "13\"", websiteProductId: "keyboard-ipad-pro-13", websiteVariantKey: "base" },
  { group: "A16 Keyboard", category: "Apple accessories", name: "Magic Keyboard Folio (A16)", configuration: "", websiteProductId: "keyboard-folio", websiteVariantKey: "base" },
  { group: "Magic Mouse", category: "Apple accessories", name: "Magic Mouse", configuration: "", websiteProductId: "mouse-usbc-white", websiteVariantKey: "base" },
];

export function websiteCatalogSku(listing: WebsiteCatalogListing, condition: "NEW" | "EX_UK" = "NEW") {
  return `WEB-${listing.websiteProductId}-${listing.websiteVariantKey}-${condition}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isManagedAccessoryId(id: string) {
  return WEBSITE_MANAGED_ACCESSORY_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function listingKey(listing: Pick<WebsiteCatalogListing, "websiteProductId" | "websiteVariantKey">) {
  return `${listing.websiteProductId}::${listing.websiteVariantKey}`;
}
