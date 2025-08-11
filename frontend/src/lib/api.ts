// Centralized API client for PipeFox
export const apiBase =
  (import.meta as any).env?.VITE_API_URL ||
  (window.location.hostname.includes("replit")
    ? `https://${window.location.hostname.replace('5173', '5000')}`
    : "http://localhost:5000");

type ReqInit = Omit<RequestInit, 'body'> & { json?: any };

/**
 * Centralized request function for the API.
 * Handles JSON body, credentials, and error parsing.
 */
async function req(path: string, init: ReqInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };

  const options: RequestInit = {
    credentials: "include", // Essential for sending session cookies
    ...init,
    headers,
  };

  if (init.json) {
    options.body = JSON.stringify(init.json);
  }

  const res = await fetch(`${apiBase}${path}`, options);

  if (!res.ok) {
    // Try to parse a JSON error message from the backend, otherwise use a default
    const errorData = await res.json().catch(() => ({ error: `Request failed with status ${res.status}` }));
    throw new Error(errorData.error || 'An unknown error occurred');
  }

  // Handle responses with no content (e.g., DELETE)
  if (res.status === 204) {
    return null;
  }

  // Always expect JSON for successful responses
  return res.json();
}

/* =========== AUTH =========== */
export function login(body: { email: string; password: string }) {
  return req("/api/auth/login", { method: "POST", json: body });
}
export function signup(body: { email: string; password: string }) {
  return req("/api/auth/signup", { method: "POST", json: body });
}
export function me() {
  return req("/api/auth/me", { method: "GET" });
}
export function logout() {
  return req("/api/auth/logout", { method: "POST" });
}
export function resetPassword(email: string) {
  return req("/api/auth/reset", { method: "POST", json: { email } });
}
export function deleteUserAccount() {
  return req("/api/auth/account", { method: "DELETE" });
}
export function loginWithGoogle() {
  // Redirects to the backend OAuth flow
  window.location.href = `${apiBase}/api/auth/google`;
}

/* =========== ACCOUNTS =========== */
export function getAccounts() {
  return req("/api/accounts", { method: "GET" });
}
export function createAccount(body: { name: string }) {
  return req("/api/accounts", { method: "POST", json: body });
}
export function loginAccount(id: string) {
  return req(`/api/accounts/${id}/login`, { method: "POST" });
}
export function logoutAccount(id: string) {
  return req(`/api/accounts/${id}/logout`, { method: "POST" });
}
export function debugAccountSession(id: string) {
  return req(`/api/accounts/${id}/debug-session`, { method: "GET" });
}

// Delete account (unified function)
export const deleteAccount = async (accountId: string) => {
  const response = await fetch(`${apiBase}/api/accounts/${accountId}`, {
    method: 'DELETE',
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao deletar conta')
  }

  return response.json()
}

// Dashboard API
export const getDashboardSummary = async () => {
  const response = await fetch(`${apiBase}/api/dashboard/summary`, {
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar resumo do dashboard')
  }

  return response.json()
}

export const getDashboardTrends = async (days: number = 7) => {
  const response = await fetch(`${apiBase}/api/dashboard/trends?days=${days}`, {
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar tendências')
  }

  return response.json()
}

export const getTopGroups = async (limit: number = 10) => {
  const response = await fetch(`${apiBase}/api/dashboard/top-groups?limit=${limit}`, {
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar grupos principais')
  }

  return response.json()
}

// Accounts stats
export const getAccountsStats = async () => {
  const response = await fetch(`${apiBase}/api/accounts/stats`, {
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar estatísticas das contas')
  }

  return response.json()
}

// Workflows stats
export const getWorkflowsStats = async () => {
  const response = await fetch(`${apiBase}/api/workflows/stats`, {
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar estatísticas dos workflows')
  }

  return response.json()
}

// Plans API
export const getPlans = async () => {
  const response = await fetch(`${apiBase}/api/plans`, {
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar planos')
  }

  return response.json()
}

export const checkout = async (planId: string, paymentMethod: string) => {
  const response = await fetch(`${apiBase}/api/plans/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ planId, paymentMethod })
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao processar pagamento')
  }

  return response.json()
}

export const getSubscription = async () => {
  const response = await fetch(`${apiBase}/api/plans/subscription`, {
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao buscar assinatura')
  }

  return response.json()
}

export const cancelSubscription = async () => {
  const response = await fetch(`${apiBase}/api/plans/subscription/cancel`, {
    method: 'POST',
    credentials: 'include'
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Erro ao cancelar assinatura')
  }

  return response.json()
}


/* =========== WORKFLOWS =========== */
export function getWorkflows() {
  return req("/api/workflows", { method: "GET" });
}
export function getWorkflow(id: string) {
  return req(`/api/workflows/${id}`, { method: "GET" });
}
export function createWorkflow(body: {
  name: string;
  account_id: string;
  webhook_url?: string;
  groups?: Array<{
    url: string;
    name: string;
    prompt?: string;
    keywords?: string[];
    is_active?: boolean;
  }>;
}) {
  return req("/api/workflows", { method: "POST", json: body });
}
export function startWorkflow(id: string) {
  return req(`/api/workflows/${id}/start`, { method: "POST" });
}
export function stopWorkflow(id: string) {
  return req(`/api/workflows/${id}/stop`, { method: "POST" });
}
export function getWorkflowNodes(id: string) {
  return req(`/api/workflows/${id}/nodes`, { method: "GET" });
}

/* =========== WORKFLOW NODES =========== */
export function createWorkflowNode(body: {
  workflow_id: string;
  group_url: string;
  group_name: string;
  prompt?: string;
  keywords?: string[];
  is_active?: boolean;
}) {
  return req("/api/workflow-nodes", { method: "POST", json: body });
}
export const updateWorkflowNode = async (nodeId: string, data: any) => {
  const response = await fetch(`${apiBase}/api/workflow-nodes/${nodeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error('Failed to update workflow node')
  return response.json()
}

export function deleteWorkflowNode(nodeId: string) {
  return req(`/api/workflow-nodes/${nodeId}`, { method: 'DELETE' });
}

export function deleteWorkflow(workflowId: string) {
  return req(`/api/workflows/${workflowId}`, { method: 'DELETE' });
}

/* =========== HEALTH =========== */
export function health() {
  return req("/health", { method: "GET" });
}

/* =========== STATS =========== */
export function getLeads() {
  return req('/api/leads');
}

export function getStats() {
  return req('/api/stats');
}

export function getStatsMock() {
  return req('/api/stats/mock');
}