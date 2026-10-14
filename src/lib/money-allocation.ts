export function proportionalIntegerShare(amount: number, weight: number, totalWeight: number) {
  if (
    !Number.isSafeInteger(amount)
    || !Number.isSafeInteger(weight)
    || !Number.isSafeInteger(totalWeight)
    || amount < 0
    || weight < 0
    || totalWeight <= 0
    || weight > totalWeight
  ) {
    throw new RangeError("Proportional allocation values must be non-negative safe integers with a positive total weight.");
  }

  return Number((BigInt(amount) * BigInt(weight)) / BigInt(totalWeight));
}