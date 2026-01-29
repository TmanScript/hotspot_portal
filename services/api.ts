import { RegistrationPayload, LoginPayload } from "../types";
import { API_ENDPOINT } from "../constants";

/**
 * PROXY STRATEGY
 * 1. Try Direct (Fastest, requires Walled Garden entry)
 * 2. Try AllOrigins (Reliable for simple POST)
 * 3. Try CorsProxy.io (Supports more headers)
 * 4. Try CodeTabs (Backup)
 */
const PROXIES = [
  "", // Direct attempt first
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
  "https://api.codetabs.com/v1/proxy/?quest=",
];

async function fetchWithProxy(
  targetUrl: string,
  options: RequestInit,
): Promise<Response> {
  let lastError: any;

  for (const proxy of PROXIES) {
    try {
      const isDirect = proxy === "";
      const fullUrl = isDirect
        ? targetUrl
        : `${proxy}${encodeURIComponent(targetUrl)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        isDirect ? 3000 : 7000,
      );

      const response = await fetch(fullUrl, {
        ...options,
        signal: controller.signal,
        // When using a proxy, we rely on the proxy to handle CORS for us.
        // Direct attempt uses standard 'cors' mode.
        mode: "cors",
      });

      clearTimeout(timeoutId);

      // If we get a response (even a 400 from the API), it means the connection works.
      // We only switch to the next proxy if we get a network failure (fetch error).
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      throw new Error(`Proxy returned status ${response.status}`);
    } catch (err: any) {
      const isTimeout = err.name === "AbortError";
      console.warn(
        `Attempt Failed (${proxy || "Direct"}):`,
        isTimeout ? "Timed out" : err.message,
      );
      lastError = err;
      // Continue to next proxy in the list
    }
  }

  throw new Error(
    "All connection paths are blocked. Ensure 'device.onetel.co.za' and bridges are in your uamallowed list.",
  );
}

export const registerUser = async (
  data: RegistrationPayload,
): Promise<Response> => {
  return await fetchWithProxy(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });
};

export const loginUser = async (data: LoginPayload): Promise<Response> => {
  const url = `${API_ENDPOINT}token/`;
  return await fetchWithProxy(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });
};

export const getUsage = async (token: string): Promise<Response> => {
  const url = `${API_ENDPOINT}usage/`;
  return await fetchWithProxy(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
};

export const requestOtp = async (token: string): Promise<Response> => {
  const url = `${API_ENDPOINT}phone/token/`;
  return await fetchWithProxy(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "",
  });
};

export const verifyOtp = async (
  token: string,
  code: string,
): Promise<Response> => {
  const url = `${API_ENDPOINT}phone/verify/`;
  return await fetchWithProxy(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ code }),
  });
};
