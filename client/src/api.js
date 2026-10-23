/**
 * Client API Client
 * Automatically connects to backend at /api and attaches JWT token
 */

const getAuthToken = () => {
  return localStorage.getItem('token');
};

export async function request(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || (typeof data === 'string' ? data : `Request failed with status ${res.status}`);
    const error = new Error(errorMsg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Auth
  login: (credentials) => request('/auth/login', { method: 'POST', body: credentials }),
  register: (userData) => request('/auth/register', { method: 'POST', body: userData }),
  getMe: () => request('/auth/me'),

  // Events
  getEvents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/events${qs ? `?${qs}` : ''}`);
  },
  getEvent: (id) => request(`/events/${id}`),
  createEvent: (eventData) => request('/events', { method: 'POST', body: eventData }),
  updateEvent: (id, eventData) => request(`/events/${id}`, { method: 'PUT', body: eventData }),

  // Reservations
  createReservation: (data) => request('/reservations', { method: 'POST', body: data }),
  getReservation: (id) => request(`/reservations/${id}`),
  cancelReservation: (id) => request(`/reservations/${id}/cancel`, { method: 'POST' }),
  getMyActiveReservations: () => request('/reservations/active/me'),

  // Payments (Mock)
  processMockPayment: (data) => request('/payments/mock', { method: 'POST', body: data }),

  // Organizer
  getOrganizerAnalytics: () => request('/organizer/analytics'),
  getOrganizerEvents: () => request('/organizer/events'),

  // Admin
  getAdminSummary: () => request('/admin/summary'),
  updateAdminEventStatus: (id, status) => request(`/admin/events/${id}/status`, { method: 'PUT', body: { status } }),

  // Attendee
  getMyOrders: () => request('/attendee/orders'),
};
