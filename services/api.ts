
import { RegistrationPayload, LoginPayload } from '../types';
import { API_ENDPOINT } from '../constants';

/**
 * ROBUST MULTI-PROXY ROTATION
 * These services help bypass CORS and firewall restrictions.
 */
const PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy/?quest=',
];

async function fetchWithProxy(targetUrl: string, options: RequestInit): Promise<Response> {
  let lastError: any;

  // We cycle through available proxies
  for (const proxy of PROXIES) {
    try {
      const fullUrl = `${proxy}${encodeURIComponent(targetUrl)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout per proxy
      
      const fetchOptions: RequestInit = {
        ...options,
        signal: controller.signal,
        // We use 'cors' mode but keep headers minimal to avoid preflight issues on some proxies
      };

      const response = await fetch(fullUrl, fetchOptions);
      clearTimeout(timeoutId);
      
      // If the proxy itself returns a failure (like 404/502), try the next proxy
      if (response.status >= 500) {
        throw new Error(`Proxy error ${response.status}`);
      }

      return response;
    } catch (err: any) {
      console.warn(`Bridge Failed: ${proxy}`, err.name === 'AbortError' ? 'Timeout' : err.message);
      lastError = err;
      continue; 
    }
  }
  
  throw lastError || new Error("All connection bridges are blocked. Update your Walled Garden settings.");
}

export const registerUser = async (data: RegistrationPayload): Promise<Response> => {
  return await fetchWithProxy(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(data),
  });
};

export const loginUser = async (data: LoginPayload): Promise<Response> => {
  const url = `${API_ENDPOINT}token/`;
  return await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(data),
  });
};

export const getUsage = async (token: string): Promise<Response> => {
  const url = `${API_ENDPOINT}usage/`;
  return await fetchWithProxy(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
};

export const requestOtp = async (token: string): Promise<Response> => {
  const url = `${API_ENDPOINT}phone/token/`;
  return await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: '',
  });
};

export const verifyOtp = async (token: string, code: string): Promise<Response> => {
  const url = `${API_ENDPOINT}phone/verify/`;
  return await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ code }),
  });
};
