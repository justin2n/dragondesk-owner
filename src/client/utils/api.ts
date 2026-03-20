const API_URL = '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

export const api = {
  async get(endpoint: string) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      } catch (e) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    // Check if response has content before parsing
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  },

  async post(endpoint: string, data?: any) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      ...(data && { body: JSON.stringify(data) }),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      } catch (e) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    // Check if response has content before parsing
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  },

  async put(endpoint: string, data: any) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      } catch (e) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    // Check if response has content before parsing
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  },

  async delete(endpoint: string) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      } catch (e) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    // Check if response has content before parsing
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  },

  async patch(endpoint: string, data: any) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      } catch (e) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    // Check if response has content before parsing
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  },
};
