const API_BASE = '/api';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(error.error || 'Request failed', response.status);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  get: (endpoint: string) => request(endpoint),

  post: (endpoint: string, data?: unknown) => request(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),

  put: (endpoint: string, data?: unknown) => request(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  }),

  delete: (endpoint: string, data?: unknown) => request(endpoint, {
    method: 'DELETE',
    body: data ? JSON.stringify(data) : undefined,
  }),

  // Special method for downloading files
  download: async (endpoint: string, filename: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new ApiError('Download failed', response.status);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Special method for uploading files
  uploadFile: async (endpoint: string, file: File, fieldName: string = 'file') => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append(fieldName, file);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new ApiError(error.error || 'Upload failed', response.status);
    }

    return response.json();
  },

  uploadFiles: async (endpoint: string, files: File[], fieldName: string = 'files') => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    files.forEach(file => formData.append(fieldName, file));

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new ApiError(error.error || 'Upload failed', response.status);
    }

    return response.json();
  },
};

export { ApiError };
