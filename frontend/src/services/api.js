const API_BASE = '/api';
const TOKEN_KEY = 'nms_auth_token';
const USER_KEY = 'nms_auth_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const user = localStorage.getItem(USER_KEY);
  try {
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function setAuthSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function fetchApi(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  const token = getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401 && !endpoint.includes('/auth/login')) {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent('nms:unauthorized'));
    throw new Error('Sesi autentikasi telah berakhir. Silakan login kembali.');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Terjadi kesalahan pada server');
  }
  return data;
}

// Authentication
export const loginApi = (username, password) =>
  fetchApi('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const getMeApi = () => fetchApi('/auth/me');

// Devices
export const getDevices = () => fetchApi('/devices');
export const createDevice = (device) => fetchApi('/devices', { method: 'POST', body: JSON.stringify(device) });
export const updateDevice = (id, device) => fetchApi(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(device) });
export const deleteDevice = (id) => fetchApi(`/devices/${id}`, { method: 'DELETE' });
export const getDeviceStatus = (id) => fetchApi(`/devices/${id}/status`);
export const executeCommand = (id, command) => fetchApi(`/devices/${id}/execute`, { method: 'POST', body: JSON.stringify({ command }) });
export const detectDeviceCards = (id) => fetchApi(`/devices/${id}/detect-cards`, { method: 'POST' });
export const detectCardsRaw = (data) => fetchApi('/devices/detect-cards-raw', { method: 'POST', body: JSON.stringify(data) });
export const getDeviceONUTypes = (id) => fetchApi(`/devices/${id}/onu-types`);

// ONUs & Provisioning
export const getONUs = (deviceId) => fetchApi(`/onus${deviceId && deviceId !== 'all' ? `?device_id=${deviceId}` : ''}`);
export const provisionONU = (params) => fetchApi('/onu/provision', { method: 'POST', body: JSON.stringify(params) });
export const pushPPPoE = (onuId, params) => fetchApi(`/onu/${onuId}/pppoe`, { method: 'POST', body: JSON.stringify(params) });
export const deleteONU = (onuId) => fetchApi(`/onu/${onuId}`, { method: 'DELETE' });
export const getNextAvailableONUIndex = (deviceId, portId, cardSlot = 1) =>
  fetchApi(`/devices/${deviceId}/ports/${portId}/next-onu-index?card_slot=${cardSlot}`);
export const preCheckOpticalPower = (params) => fetchApi('/onu/pre-check-optical', { method: 'POST', body: JSON.stringify(params) });
export const getUnconfiguredONUs = (deviceId) => fetchApi(`/onu/unconfigured${deviceId ? `?device_id=${deviceId}` : ''}`);
export const getONUStatus = (onuId) => fetchApi(`/onu/${onuId}/status`);
export const replaceONU = (onuId, data) => fetchApi(`/onu/${onuId}/replace`, { method: 'POST', body: JSON.stringify(data) });
export const rebootONU = (onuId) => fetchApi(`/onu/${onuId}/reboot`, { method: 'POST' });
export const changeONUProfile = (onuId, data) => fetchApi(`/onu/${onuId}/change-profile`, { method: 'POST', body: JSON.stringify(data) });
export const simulateONUState = (onuId, data) => fetchApi(`/onu/${onuId}/simulate-state`, { method: 'POST', body: JSON.stringify(data) });
export const syncONUsFromOLT = (deviceId = 'all', data = {}) =>
  fetchApi(`/devices/${deviceId}/sync-onus`, { method: 'POST', body: JSON.stringify(data) });
export const repushONUConfig = (onuId, data) =>
  fetchApi(`/onu/${onuId}/repush-config`, { method: 'POST', body: JSON.stringify(data) });

// Loop Protection & Broadcast Storm
export const getLoopIncidents = (status = 'all', deviceId = 'all') => {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.append('status', status);
  if (deviceId && deviceId !== 'all') params.append('device_id', deviceId);
  const q = params.toString();
  return fetchApi(`/loop-protection/incidents${q ? `?${q}` : ''}`);
};
export const scanLoopback = () =>
  fetchApi('/loop-protection/scan', { method: 'POST' });
export const resolveLoopIncident = (incidentId) =>
  fetchApi(`/loop-protection/resolve/${incidentId}`, { method: 'POST' });
export const simulateLoopIncident = (data = {}) =>
  fetchApi('/loop-protection/simulate', { method: 'POST', body: JSON.stringify(data) });

// Profiles
export const getProfiles = () => fetchApi('/service-profiles');
export const createProfile = (profile) => fetchApi('/service-profiles', { method: 'POST', body: JSON.stringify(profile) });
export const updateProfile = (id, profile) => fetchApi(`/service-profiles/${id}`, { method: 'PUT', body: JSON.stringify(profile) });
export const deleteProfile = (id) => fetchApi(`/service-profiles/${id}`, { method: 'DELETE' });

// Audit Logs
export const getAuditLogs = (filters = {}) => {
  const query = new URLSearchParams(filters).toString();
  return fetchApi(`/logs${query ? `?${query}` : ''}`);
};

// Topology
export const getTopology = (deviceId) =>
  fetchApi(`/topology${deviceId ? `?device_id=${deviceId}` : ''}`);

// Integrations & Notifications
export const getIntegrationSettings = () => fetchApi('/integrations/settings');
export const saveIntegrationSettings = (settings) => fetchApi('/integrations/settings', { method: 'POST', body: JSON.stringify(settings) });
export const getGenieACSStatus = () => fetchApi('/genieacs/status');
export const syncGenieACS = (url) => fetchApi('/genieacs/sync', { method: 'POST', body: JSON.stringify({ genieacs_url: url }) });
export const rebootGenieACSCPE = (cpeId) => fetchApi(`/genieacs/device/${encodeURIComponent(cpeId)}/reboot`, { method: 'POST' });
export const sendTestNotification = (target, message) => fetchApi('/notifications/test', { method: 'POST', body: JSON.stringify({ target, message }) });
export const simulateIncidentAlert = (incidentType) => fetchApi('/notifications/simulate', { method: 'POST', body: JSON.stringify({ incidentType }) });

// Background Poller & Real-time Optical History
export const getPollerStatus = () => fetchApi('/poller/status');
export const togglePoller = (enable, intervalSeconds) => fetchApi('/poller/toggle', { method: 'POST', body: JSON.stringify({ enable, interval_seconds: intervalSeconds }) });
export const triggerManualSweep = () => fetchApi('/poller/run', { method: 'POST' });
export const getONUOpticalHistory = (onuId) => fetchApi(`/onus/${onuId}/optical-history`);

// User Management (RBAC)
export const getUsers = () => fetchApi('/users');
export const createUser = (data) => fetchApi('/users', { method: 'POST', body: JSON.stringify(data) });
export const updateUser = (id, data) => fetchApi(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteUser = (id) => fetchApi(`/users/${id}`, { method: 'DELETE' });

// MikroTik Core Router (BRAS & PPPoE)
export const getMikroTikStatus = () => fetchApi('/mikrotik/status');
export const getMikroTikSettings = () => fetchApi('/mikrotik/settings');
export const saveMikroTikSettings = (data) => fetchApi('/mikrotik/settings', { method: 'POST', body: JSON.stringify(data) });

