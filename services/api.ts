import { RegistrationPayload, LoginPayload } from "../types";
import { API_ENDPOINT } from "../constants";

/**
 * RESILIENT BRIDGE SYSTEM
 * We rotate through different strategies to reach the backend.
 */
const STRATEGIES = [
  { name: "Direct", proxy: "", type: "direct" },
  { name: "Bridge Alpha", proxy: "https://corsproxy.io/?", type: "standard" },
  {
    name: "Bridge Beta",
    proxy: "https://api.codetabs.com/v1/proxy/?quest=",
    type: "standard",
  },
  {
    name: "Bridge Gamma",
    proxy: "https://api.allorigins.win/raw?url=",
    type: "allorigins",
  },
];

async function fetchWithResilience(
  targetUrl: string,
  options: RequestInit,
): Promise<Response> {
  let lastError: any;

  for (const strategy of STRATEGIES) {
    try {
      let fullUrl = strategy.proxy
        ? `${strategy.proxy}${encodeURIComponent(targetUrl)}`
        : targetUrl;

      // AllOrigins has issues with POST on the /raw endpoint, so we skip it for non-GET
      if (strategy.type === "allorigins" && options.method !== "GET") continue;

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        strategy.proxy ? 8000 : 3000,
      );

      const response = await fetch(fullUrl, {
        ...options,
        signal: controller.signal,
        mode: "cors",
        credentials: "omit",
      });

      clearTimeout(timeoutId);

      // We accept any valid HTTP response from the target server (even 4xx/5xx)
      // as it means the bridge successfully reached the Onetel API.
      if (response.status > 0) {
        return response;
      }
    } catch (err: any) {
      console.warn(`Strategy [${strategy.name}] Failed:`, err.message);
      lastError = err;
    }
  }

  throw new Error(
    "Network path blocked. Please check your Walled Garden settings and ensure 'device.onetel.co.za' is allowed.",
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
