export function reorderThreshold(branchLevel: number, productLevel = 0) {
  return Math.max(0, branchLevel, productLevel);
}

export function needsReorder(available: number, branchLevel: number, productLevel = 0) {
  const threshold = reorderThreshold(branchLevel, productLevel);
  return threshold > 0 && available <= threshold;
}

export function stockAttentionRank(available: number, branchLevel: number, productLevel = 0) {
  if (needsReorder(available, branchLevel, productLevel)) return 0;
  if (available <= 0) return 1;
  return 2;
}
