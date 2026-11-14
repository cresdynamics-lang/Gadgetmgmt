import { z } from "zod";

export const accountPasswordSchema = z.string().min(12).max(72).refine(value => new TextEncoder().encode(value).length <= 72, "Use at most 72 UTF-8 bytes.");

export function generateAccountPassword() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), value => alphabet[value & 63]).join("");
}
