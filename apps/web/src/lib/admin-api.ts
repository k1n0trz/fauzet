import {
  adminAuditResponseSchema,
  adminLedgerResponseSchema,
  adminMutationResponseSchema,
  adminOverviewResponseSchema,
  adminRiskResponseSchema,
  adminSessionResponseSchema,
  adminUsersResponseSchema,
  adminWithdrawalDecisionResponseSchema,
  adminWithdrawalsResponseSchema,
  authResponseSchema,
  type AdminAuditResponse,
  type AdminLedgerResponse,
  type AdminOverviewResponse,
  type AdminRiskResponse,
  type AdminSessionResponse,
  type AdminUsersResponse,
  type AdminWithdrawalsResponse,
} from "@fauzet/contracts";
import { API_BASE } from "./api";

export async function adminSession(): Promise<AdminSessionResponse> {
  return adminSessionResponseSchema.parse(
    await request("/admin/session", { method: "GET" }),
  );
}

export async function adminLogin(email: string, password: string) {
  try {
    authResponseSchema.parse(
      await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    );
    return adminSessionResponseSchema.parse(
      await request("/admin/auth/step-up", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    );
  } catch (error) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    throw error;
  }
}

export async function adminLogout() {
  const [adminResult, sessionResult] = await Promise.allSettled([
    fetch(`${API_BASE}/admin/auth/logout`, {
      method: "POST",
      credentials: "include",
    }),
    fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }),
  ]);

  if (sessionResult.status === "rejected" || !sessionResult.value.ok) {
    throw new Error(
      "No fue posible revocar la sesión principal. Sigues conectado.",
    );
  }

  // Once the base session is revoked, its administrative step-up can no
  // longer authorize requests. A secondary endpoint failure must not keep
  // sensitive data rendered in the browser.
  void adminResult;
}

export async function getAdminOverview(): Promise<AdminOverviewResponse> {
  return adminOverviewResponseSchema.parse(
    await request("/admin/overview", { method: "GET" }),
  );
}
export async function getAdminUsers(search = ""): Promise<AdminUsersResponse> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return adminUsersResponseSchema.parse(
    await request(`/admin/users${query}`, { method: "GET" }),
  );
}
export async function getAdminLedger(): Promise<AdminLedgerResponse> {
  return adminLedgerResponseSchema.parse(
    await request("/admin/ledger", { method: "GET" }),
  );
}
export async function getAdminAudit(): Promise<AdminAuditResponse> {
  return adminAuditResponseSchema.parse(
    await request("/admin/audit", { method: "GET" }),
  );
}
export async function getAdminRisk(): Promise<AdminRiskResponse> {
  return adminRiskResponseSchema.parse(
    await request("/admin/risk", { method: "GET" }),
  );
}
export async function getAdminWithdrawals(): Promise<AdminWithdrawalsResponse> {
  return adminWithdrawalsResponseSchema.parse(
    await request("/admin/withdrawals", { method: "GET" }),
  );
}
export async function decideAdminWithdrawal(
  withdrawalId: string,
  decision: "APPROVE" | "REJECT",
  reason: string,
) {
  return adminWithdrawalDecisionResponseSchema.parse(
    await request(`/admin/withdrawals/${withdrawalId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, reason }),
    }),
  );
}
export async function updateAdminUserStatus(
  userId: string,
  status: "ACTIVE" | "RESTRICTED" | "SUSPENDED",
  reason: string,
) {
  return adminMutationResponseSchema.parse(
    await request(`/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    }),
  );
}
export async function updateAdminRisk(
  userId: string,
  riskLevel: number,
  reason: string,
) {
  return adminMutationResponseSchema.parse(
    await request(`/admin/users/${userId}/risk`, {
      method: "PATCH",
      body: JSON.stringify({ riskLevel, reason }),
    }),
  );
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : "Administrative request failed";
    throw new Error(message);
  }
  return payload;
}
