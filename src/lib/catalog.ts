/** Product types the shop stocks. Apple only, plus phones that come in as trade-ins. */
export const productCategories = ["iPhone", "iPad", "Mac", "Apple Watch", "AirPods", "Apple TV & Home", "Apple accessories", "Other brands"] as const;

export const conditionLabels: Record<string, string> = { NEW: "New", EX_UK: "Ex-UK", TRADE_IN: "Trade-in" };
