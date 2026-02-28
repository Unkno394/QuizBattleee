const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const normalizeBase = (value: string) => value.replace(/\/+$/, "");

const CONFIGURED_API_BASE = normalizeBase(
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3001"
);

export const getApiBase = () => {
  if (typeof window === "undefined") {
    return CONFIGURED_API_BASE;
  }

  try {
    const parsed = new URL(CONFIGURED_API_BASE);
    const currentHost = window.location.hostname;
    const configuredIsLocal = LOCAL_HOSTS.has(parsed.hostname);
    const currentIsLocal = LOCAL_HOSTS.has(currentHost);

    // If frontend is opened from another host/device, localhost in env points to the wrong machine.
    if (configuredIsLocal && !currentIsLocal) {
      parsed.hostname = currentHost;
      return normalizeBase(parsed.toString());
    }

    return normalizeBase(parsed.toString());
  } catch {
    return CONFIGURED_API_BASE;
  }
};

export const buildApiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBase()}${normalizedPath}`;
};

export const toBearerToken = (rawToken: string | null | undefined) => {
  const value = String(rawToken || "").trim();
  if (!value) return "";
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
};

export const fetchApi = async (path: string, init?: RequestInit) => {
  const target = buildApiUrl(path);
  const shouldTryRelative = typeof window !== "undefined" && path.startsWith("/");

  const tryRelative = async () => {
    if (!shouldTryRelative) {
      throw new Error("Relative fallback is unavailable");
    }
    return fetch(path, init);
  };

  try {
    const response = await fetch(target, init);
    if (!shouldTryRelative) return response;

    // If API base points to another origin/host and returns not found/server error,
    // try same-origin /api proxy before failing.
    try {
      const targetUrl = new URL(target);
      const isDifferentOrigin = targetUrl.origin !== window.location.origin;
      if (isDifferentOrigin && (response.status === 404 || response.status >= 500)) {
        return await tryRelative();
      }
    } catch {
      // ignore URL parsing issues and keep original response
    }

    return response;
  } catch (error) {
    // Fallback for deployments where backend is available via same-origin /api proxy.
    if (shouldTryRelative) {
      return await tryRelative();
    }
    throw error;
  }
};
