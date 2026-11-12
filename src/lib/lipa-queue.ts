const URGENCY: Record<string, number> = {
  RECOVERY: 0,
  LATE_3: 1,
  LATE_2: 2,
  LATE_1: 3,
  OVERDUE: 4,
  DUE: 5,
  GRACE: 6,
  DUE_SOON: 7,
  ACTIVE: 8,
  PAID_OFF: 9,
};

export function lipaUrgencyRank(status: string) {
  return URGENCY[status] ?? 50;
}

export function compareLipaUrgency(left: { status: string; nextDueDate: string | Date }, right: { status: string; nextDueDate: string | Date }) {
  const rank = lipaUrgencyRank(left.status) - lipaUrgencyRank(right.status);
  if (rank !== 0) return rank;
  return new Date(left.nextDueDate).getTime() - new Date(right.nextDueDate).getTime();
}

export function sortLipaPlans<T extends { status: string; nextDueDate: string | Date }>(plans: readonly T[]) {
  return [...plans].sort(compareLipaUrgency);
}
