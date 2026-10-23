export const tradeInBrands = ["APPLE", "SAMSUNG"] as const;
export type TradeInBrand = (typeof tradeInBrands)[number];

/** Any device the shop takes in part-exchange, grouped by type. Each type maps to a stock category. */
export const tradeInDevices: Record<TradeInBrand, Record<string, { category: string; models: string[] }>> = {
  APPLE: {
    iPhone: {
      category: "iPhone",
      models: [
        "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
        "iPhone 12", "iPhone 12 mini", "iPhone 12 Pro", "iPhone 12 Pro Max",
        "iPhone 13", "iPhone 13 mini", "iPhone 13 Pro", "iPhone 13 Pro Max",
        "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
        "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
        "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max",
        "iPhone SE (3rd gen)",
      ],
    },
    iPad: {
      category: "iPad",
      models: ["iPad (9th gen)", "iPad (10th gen)", "iPad mini (6th gen)", "iPad Air (M1)", "iPad Air (M2)", "iPad Pro 11-inch", "iPad Pro 12.9-inch", "iPad Pro (M4)"],
    },
    MacBook: {
      category: "Mac",
      models: ["MacBook Air M1", "MacBook Air M2", "MacBook Air M3", "MacBook Pro 13-inch M1", "MacBook Pro 13-inch M2", "MacBook Pro 14-inch", "MacBook Pro 16-inch", "iMac", "Mac mini"],
    },
    "Apple Watch": {
      category: "Apple Watch",
      models: ["Apple Watch SE", "Apple Watch Series 7", "Apple Watch Series 8", "Apple Watch Series 9", "Apple Watch Series 10", "Apple Watch Ultra", "Apple Watch Ultra 2"],
    },
    AirPods: {
      category: "AirPods",
      models: ["AirPods (3rd gen)", "AirPods (4th gen)", "AirPods Pro", "AirPods Pro 2", "AirPods Max"],
    },
  },
  SAMSUNG: {
    Phone: {
      category: "Other brands",
      models: ["Galaxy A35", "Galaxy A55", "Galaxy S22", "Galaxy S23", "Galaxy S24", "Galaxy S24 Ultra", "Galaxy S25", "Galaxy S25 Ultra", "Galaxy Z Flip", "Galaxy Z Fold"],
    },
    Tablet: {
      category: "Other brands",
      models: ["Galaxy Tab A9", "Galaxy Tab S9", "Galaxy Tab S10"],
    },
  },
};

export function tradeInBrandLabel(brand: string) {
  return brand === "APPLE" ? "Apple" : brand === "SAMSUNG" ? "Samsung" : brand;
}

/** Stock category for a traded-in device, matching the shop's product types. */
export function tradeInCategory(brand: string, deviceType: string) {
  return tradeInDevices[brand as TradeInBrand]?.[deviceType]?.category ?? (brand === "APPLE" ? "Apple accessories" : "Other brands");
}
