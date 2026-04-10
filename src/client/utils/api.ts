const API_URL = '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

// Attempt to refresh the token. Returns true if successful.
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

const tryRefresh = (): Promise<boolean> => {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
};

const redirectToLogin = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

const request = async (method: string, endpoint: string, data?: any): Promise<any> => {
  const fetchOptions: RequestInit = {
    method,
    headers: getAuthHeaders(),
    ...(data !== undefined && { body: JSON.stringify(data) }),
  };

  let response = await fetch(`${API_URL}${endpoint}`, fetchOptions);

  // On 401, try to refresh once then retry
  if (response.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      fetchOptions.headers = getAuthHeaders();
      response = await fetch(`${API_URL}${endpoint}`, fetchOptions);
    } else {
      redirectToLogin();
      throw new Error('Session expired. Please log in again.');
    }
  }

  // Still unauthorized after refresh — send to login
  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  return parseResponse(response);
};

export const api = {
  get: (endpoint: string) => request('GET', endpoint),
  post: (endpoint: string, data?: any) => request('POST', endpoint, data ?? {}),
  put: (endpoint: string, data: any) => request('PUT', endpoint, data),
  patch: (endpoint: string, data: any) => request('PATCH', endpoint, data),
  delete: (endpoint: string) => request('DELETE', endpoint),
};
