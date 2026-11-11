// Do not expose proxy HTML or server stack traces in notification error messages.
export async function notificationResponse<T extends object>(response: Response): Promise<T> {
  let result: unknown;
  try { result = await response.json(); }
  catch {
    throw new Error(response.ok
      ? "The server returned an empty or invalid response. Refresh to check the latest status before trying again."
      : `Notification request failed (HTTP ${response.status}). Please try again.`);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("The server returned an invalid notification response. Refresh to check the latest status.");
  }
  const data = result as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `Notification request failed (HTTP ${response.status}).`);
  return data as T;
}
