/** User-facing copy when an API returns HTML or a broken body instead of JSON. */
export function apiErrorMessage(status: number) {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That record was not found.";
  if (status === 408 || status === 504) return "That took too long. Try again.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (!status || status === 502 || status === 503) return "The operations app is briefly unavailable. Wait a few seconds and try again.";
  if (status >= 500) return "Something went wrong. Wait a few seconds and try again.";
  return "Something went wrong. Try again.";
}

export function isJsonParseError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error instanceof SyntaxError) return true;
  return /not valid JSON|JSON\.parse|Unexpected token|JSON Parse error|unexpected character/i.test(error.message);
}

export function looksLikeHtml(body: string) {
  const start = body.trim().slice(0, 64).toLowerCase();
  return start.startsWith("<!doctype") || start.startsWith("<html") || start.startsWith("<head") || start.startsWith("<body");
}

export function parseApiBody(text: string, status: number) {
  const body = text.trim();
  if (!body) {
    if (status && status >= 400) throw new Error(apiErrorMessage(status));
    return {};
  }
  if (looksLikeHtml(body) || body.startsWith("<")) {
    throw new Error(apiErrorMessage(status || 502));
  }
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    if (isJsonParseError(error)) throw new Error(apiErrorMessage(status || 502));
    throw error;
  }
}

export function protectResponse(response: Response): Response {
  const origJson = response.json.bind(response);
  const origClone = response.clone.bind(response);

  Object.defineProperty(response, "json", {
    configurable: true,
    value: async () => {
      try {
        return await origJson();
      } catch (error) {
        if (isJsonParseError(error)) throw new Error(apiErrorMessage(response.status));
        throw error;
      }
    },
  });

  Object.defineProperty(response, "clone", {
    configurable: true,
    value: () => protectResponse(origClone()),
  });

  return response;
}

let installed = false;

export function installApiGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    try {
      return protectResponse(await originalFetch(input, init));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new Error("No connection. Check the network and try again.");
    }
  };
}
