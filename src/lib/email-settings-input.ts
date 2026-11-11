import { z } from "zod";

export const emailSettingsInput = z.object({
  senderEmail: z.string().trim().max(254).pipe(z.email()),
  senderName: z.string().trim().min(1).max(100).refine((value) => !/[\r\n<>]/.test(value), "Enter a sender name without line breaks or angle brackets."),
});
