import { RegistrationPayload, LoginPayload } from "../types";
import { API_ENDPOINT } from "../constants";

/**
 * BRIDGE STRATEGIES
 * We use multiple proxies with different characteristics to ensure
 * that we can bypass both router blocks and CORS restrictions.
 */
export const BRIDGES = [
  { name: "Direct Path", proxy: "", type: "direct" },
  { name: "Cloud Bridge A", proxy: "https://corsproxy.io/?", type: "standard" },
  {
    name: "Cloud Bridge B",
    proxy: "https://api.codetabs.com/v1/proxy/?quest=",
    type: "standard",
  },
  {
    name: "Backup Bridge",
    proxy: "https://api.allorigins.win/raw?url=",
    type: "allorigins",
  },
];

export interface BridgeError {
  bridge: string;
  error: string;
  timestamp: string;
}

// Global log to track connection attempts for debugging in the UI
export let lastBridgeLogs: BridgeError[] = [];

async function fetchWithResilience(
  targetUrl: string,
  options: RequestInit,
): Promise<Response> {
  lastBridgeLogs = [];
  let lastError: any;

  for (const bridge of BRIDGES) {
    try {
      const isDirect = bridge.type === "direct";
      const fullUrl = isDirect
        ? targetUrl
        : `${bridge.proxy}${encodeURIComponent(targetUrl)}`;

      // AllOrigins /raw only reliably supports GET
      if (bridge.type === "allorigins" && options.method !== "GET") continue;

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        isDirect ? 4000 : 10000,
      );

      const response = await fetch(fullUrl, {
        ...options,
        signal: controller.signal,
        mode: "cors",
        credentials: "omit",
      });

      clearTimeout(timeoutId);

      // If we got ANY response (even 401 or 404), the bridge is working.
      // We only move to the next bridge if we get a NETWORK error (Failed to fetch).
      if (response.status > 0) {
        return response;
      }

      throw new Error(`Status ${response.status}`);
    } catch (err: any) {
      const errorMsg = err.name === "AbortError" ? "Timed out" : err.message;
      console.warn(`Bridge [${bridge.name}] failed:`, errorMsg);
      lastBridgeLogs.push({
        bridge: bridge.name,
        error: errorMsg,
        timestamp: new Date().toLocaleTimeString(),
      });
      lastError = err;
    }
  }

  throw new Error(
    "Critical: No available connection path. The hotspot router is blocking all API bridges.",
  );
}

export const registerUser = async (
  data: RegistrationPayload,
): Promise<Response> => {
  return await fetchWithResilience(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
};

export const loginUser = async (data: LoginPayload): Promise<Response> => {
  const url = `${API_ENDPOINT}token/`;
  return await fetchWithResilience(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
};

export const getUsage = async (token: string): Promise<Response> => {
  const url = `${API_ENDPOINT}usage/`;
  return await fetchWithResilience(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const requestOtp = async (token: string): Promise<Response> => {
  const url = `${API_ENDPOINT}phone/token/`;
  return await fetchWithResilience(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: "",
  });
};

export const verifyOtp = async (
  token: string,
  code: string,
): Promise<Response> => {
  const url = `${API_ENDPOINT}phone/verify/`;
  return await fetchWithResilience(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
};
