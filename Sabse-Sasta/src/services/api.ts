// API service for backend communication
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Get auth token from localStorage
export const getToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Set auth token in localStorage
export const setAuthToken = (token: string): void => {
  localStorage.setItem('auth_token', token);
};

// Remove auth token from localStorage
export const removeAuthToken = (): void => {
  localStorage.removeItem('auth_token');
};

// API request helper
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || 'Request failed');
  }

  return response.json();
};

// Auth API
export const authAPI = {
  register: async (data: { email: string; password: string; fullName: string; phone?: string; userType?: 'customer' | 'vendor' }) => {
    return apiRequest<{ user: any; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  login: async (data: { email: string; password: string }) => {
    return apiRequest<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  googleAuth: async (data: { idToken: string; userType?: 'customer' | 'vendor' }) => {
    return apiRequest<{ user: any; token: string }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  requestPasswordReset: async (data: { email: string }) => {
    return apiRequest<{ message: string }>('/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  resetPassword: async (data: { token: string; newPassword: string }) => {
    return apiRequest<{ message: string }>('/auth/reset', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Profile API
export const profileAPI = {
  get: async () => {
    return apiRequest<any>('/profile');
  },

  update: async (data: { fullName?: string; phone?: string }) => {
    return apiRequest<any>('/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// Products API
export const productsAPI = {
  search: async (query: string) => {
    const params = new URLSearchParams({ name: query });
    const result = await apiRequest<{ products: any[]; total: number; limit: number; offset: number }>(`/products/search?${params}`);
    // Backend returns { products, total, limit, offset }, extract products array
    return result.products || [];
  },

  getFeatured: async () => {
    return apiRequest<any[]>('/products/featured');
  },

  getAll: async () => {
    return apiRequest<any[]>('/products');
  },

  getVendorsByProduct: async (productId: string) => {
    return apiRequest<{
      product: any;
      vendors: Array<{
        vendorId: string;
        vendorName: string;
        price: number;
        stockQuantity?: number | null;
        isAvailable?: boolean;
      }>;
    }>(`/products/${productId}/vendors`);
  },
};

// Shopping Lists API
export const shoppingListsAPI = {
  getAll: async () => {
    return apiRequest<any[]>('/shopping-lists');
  },

  getById: async (id: string) => {
    return apiRequest<any>(`/shopping-lists/${id}`);
  },

  create: async (data: { name: string; items: Array<{ productId: string; quantity: number }> }) => {
    // First create the list
    const list = await apiRequest<any>('/shopping-lists', {
      method: 'POST',
      body: JSON.stringify({ name: data.name }),
    });

    // Get the list ID (could be list_id or id)
    const listId = list.list_id?.toString() || list.id;

    // Then add items
    for (const item of data.items) {
      await apiRequest<any>(`/shopping-lists/${listId}/items`, {
        method: 'POST',
        body: JSON.stringify({ productId: item.productId, quantity: item.quantity }),
      });
    }

    return list;
  },

  delete: async (id: string) => {
    return apiRequest<void>(`/shopping-lists/${id}`, {
      method: 'DELETE',
    });
  },

  updateName: async (id: string, name: string) => {
    return apiRequest<any>(`/shopping-lists/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  removeItem: async (listId: string, itemId: string) => {
    return apiRequest<void>(`/shopping-lists/${listId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  clearAllItems: async (listId: string) => {
    return apiRequest<void>(`/shopping-lists/${listId}/items`, {
      method: 'DELETE',
    });
  },

  addItem: async (listId: string, productId: string, quantity: number = 1) => {
    return apiRequest<any>(`/shopping-lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    });
  },

  updateItem: async (listId: string, itemId: string, quantity: number) => {
    return apiRequest<any>(`/shopping-lists/${listId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
  },

  calculateCosts: async (id: string) => {
    return apiRequest<{
      vendorOptions: Array<{
        vendor: string;
        totalCost: number;
        availableItems: number;
        totalItems: number;
        items: Array<{
          productId: string;
          productName: string;
          quantity: number;
          price: number;
          total: number;
        }>;
        unavailableItems: string[];
      }>;
      megaOption: {
        totalCost: number;
        items: Array<{
          productId: string;
          productName: string;
          quantity: number;
          vendor: string;
          price: number;
          total: number;
        }>;
      };
    }>(`/shopping-lists/${id}/calculate`, {
      method: 'POST',
    });
  },
};

// Orders API (to be implemented in backend)
export const ordersAPI = {
  create: async (data: any) => {
    return apiRequest<any>('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Vendors API (to be implemented in backend)
export const vendorsAPI = {
  getStatus: async () => {
    return apiRequest<{ approved: boolean; verified: boolean; vendorName: string; createdAt: string }>('/vendors/status');
  },
  // Upload history removed - no longer tracking uploads
  getUploads: async () => {
    return Promise.resolve([]);
  },
  getVendorProducts: async () => {
    return apiRequest<any[]>('/vendors/products');
  },
  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}/vendors/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || error.message || 'Upload failed');
    }
    return response.json();
  },
};

// Health check (note: this endpoint is at root level, not /api)
export const healthCheck = async () => {
  const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error('Health check failed');
  return response.json();
};

