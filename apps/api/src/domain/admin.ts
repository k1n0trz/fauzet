import { createHmac, randomBytes } from "node:crypto";
import type {
  AdminAuditResponse,
  AdminLedgerResponse,
  AdminOverviewResponse,
  AdminPermission,
  AdminRiskResponse,
  AdminSessionResponse,
  AdminUsersResponse,
  AdminWithdrawalDecisionResponse,
  AdminWithdrawalsResponse,
  PublicUser,
} from "@fauzet/contracts";
import { hashSessionToken } from "./auth.js";

export const ADMIN_ROLES = [
  "SUPPORT",
  "CONTENT",
  "FRAUD",
  "FINANCE",
  "AUDITOR",
  "SUPERADMIN",
  "OWNER",
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPPORT: ["OVERVIEW_READ", "USERS_READ"],
  CONTENT: ["OVERVIEW_READ"],
  FRAUD: [
    "OVERVIEW_READ",
    "USERS_READ",
    "USERS_STATUS_WRITE",
    "RISK_READ",
    "RISK_WRITE",
    "WITHDRAWALS_READ",
    "WITHDRAWALS_WRITE",
  ],
  FINANCE: [
    "OVERVIEW_READ",
    "USERS_READ",
    "LEDGER_READ",
    "CONFIG_READ",
    "WITHDRAWALS_READ",
    "WITHDRAWALS_WRITE",
  ],
  AUDITOR: [
    "OVERVIEW_READ",
    "USERS_READ",
    "RISK_READ",
    "LEDGER_READ",
    "AUDIT_READ",
    "CONFIG_READ",
    "WITHDRAWALS_READ",
  ],
  SUPERADMIN: [
    "OVERVIEW_READ",
    "USERS_READ",
    "USERS_STATUS_WRITE",
    "RISK_READ",
    "RISK_WRITE",
    "LEDGER_READ",
    "AUDIT_READ",
    "CONFIG_READ",
    "WITHDRAWALS_READ",
    "WITHDRAWALS_WRITE",
  ],
  OWNER: [
    "OVERVIEW_READ",
    "USERS_READ",
    "RISK_READ",
    "LEDGER_READ",
    "AUDIT_READ",
    "CONFIG_READ",
    "WITHDRAWALS_READ",
  ],
};

export type AdminActor = {
  user: PublicUser;
  roles: AdminRole[];
  permissions: AdminPermission[];
  expiresAt: Date;
};

export interface AdminStore {
  createAdminSession(input: {
    userId: string;
    password: string;
    baseSessionHash: string;
    tokenHash: string;
    expiresAt: Date;
    requestId: string;
    ipHash?: string;
  }): Promise<{ roles: AdminRole[] }>;
  findAdminSession(
    tokenHash: string,
    baseSessionHash: string,
    now: Date,
  ): Promise<AdminActor | null>;
  revokeAdminSession(tokenHash: string, now: Date): Promise<void>;
  overview(): Promise<AdminOverviewResponse>;
  users(input: {
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<AdminUsersResponse>;
  ledger(): Promise<AdminLedgerResponse>;
  audit(): Promise<AdminAuditResponse>;
  risk(): Promise<AdminRiskResponse>;
  withdrawals(): Promise<AdminWithdrawalsResponse>;
  decideWithdrawal(input: {
    actorId: string;
    withdrawalId: string;
    decision: "APPROVE" | "REJECT";
    reason: string;
    requestId: string;
    ipHash?: string;
  }): Promise<AdminWithdrawalDecisionResponse>;
  updateUserStatus(input: {
    actorId: string;
    targetId: string;
    status: "ACTIVE" | "RESTRICTED" | "SUSPENDED";
    reason: string;
    requestId: string;
    ipHash?: string;
  }): Promise<{
    user: Omit<AdminUsersResponse["items"][number], "balances">;
    auditEventId: string;
  }>;
  updateRisk(input: {
    actorId: string;
    targetId: string;
    riskLevel: number;
    reason: string;
    requestId: string;
    ipHash?: string;
  }): Promise<{
    user: Omit<AdminUsersResponse["items"][number], "balances">;
    auditEventId: string;
  }>;
}

export class AdminError extends Error {
  constructor(
    public readonly code:
      | "ADMIN_FORBIDDEN"
      | "ADMIN_STEP_UP_INVALID"
      | "ADMIN_SESSION_INVALID"
      | "ADMIN_TARGET_INVALID"
      | "ADMIN_WITHDRAWAL_INVALID",
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export class AdminService {
  constructor(
    private readonly store: AdminStore,
    private readonly secret: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async stepUp(input: {
    user: PublicUser;
    password: string;
    baseToken: string;
    requestId: string;
    ipHash?: string;
  }) {
    const roles = adminRoles(input.user.roles);
    if (roles.length === 0)
      throw new AdminError(
        "ADMIN_FORBIDDEN",
        "An administrative role is required",
        403,
      );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.clock().getTime() + 10 * 60_000);
    const created = await this.store.createAdminSession({
      userId: input.user.id,
      password: input.password,
      baseSessionHash: hashSessionToken(input.baseToken, this.secret),
      tokenHash: this.hashAdminToken(token),
      expiresAt,
      requestId: input.requestId,
      ...(input.ipHash ? { ipHash: input.ipHash } : {}),
    });
    const session = sessionResponse(input.user, created.roles, expiresAt);
    return { token, session };
  }

  async authenticate(input: {
    baseUser: PublicUser;
    baseToken: string;
    adminToken?: string;
  }): Promise<AdminActor> {
    if (!input.adminToken)
      throw new AdminError(
        "ADMIN_SESSION_INVALID",
        "Administrative re-authentication is required",
        401,
      );
    const actor = await this.store.findAdminSession(
      this.hashAdminToken(input.adminToken),
      hashSessionToken(input.baseToken, this.secret),
      this.clock(),
    );
    if (!actor || actor.user.id !== input.baseUser.id)
      throw new AdminError(
        "ADMIN_SESSION_INVALID",
        "Administrative session is invalid or expired",
        401,
      );
    return actor;
  }

  async logout(adminToken?: string) {
    if (adminToken)
      await this.store.revokeAdminSession(
        this.hashAdminToken(adminToken),
        this.clock(),
      );
  }

  session(actor: AdminActor): AdminSessionResponse {
    return sessionResponse(actor.user, actor.roles, actor.expiresAt);
  }

  overview(actor: AdminActor) {
    requirePermission(actor, "OVERVIEW_READ");
    return this.store.overview();
  }
  users(
    actor: AdminActor,
    input: { page: number; pageSize: number; search?: string },
  ) {
    requirePermission(actor, "USERS_READ");
    return this.store.users(input);
  }
  ledger(actor: AdminActor) {
    requirePermission(actor, "LEDGER_READ");
    return this.store.ledger();
  }
  audit(actor: AdminActor) {
    requirePermission(actor, "AUDIT_READ");
    return this.store.audit();
  }
  risk(actor: AdminActor) {
    requirePermission(actor, "RISK_READ");
    return this.store.risk();
  }
  withdrawals(actor: AdminActor) {
    requirePermission(actor, "WITHDRAWALS_READ");
    return this.store.withdrawals();
  }
  decideWithdrawal(
    actor: AdminActor,
    input: Omit<Parameters<AdminStore["decideWithdrawal"]>[0], "actorId">,
  ) {
    requirePermission(actor, "WITHDRAWALS_WRITE");
    return this.store.decideWithdrawal({ ...input, actorId: actor.user.id });
  }
  updateUserStatus(
    actor: AdminActor,
    input: Omit<Parameters<AdminStore["updateUserStatus"]>[0], "actorId">,
  ) {
    requirePermission(actor, "USERS_STATUS_WRITE");
    if (actor.user.id === input.targetId)
      throw new AdminError(
        "ADMIN_TARGET_INVALID",
        "Administrative users cannot change their own status",
        409,
      );
    return this.store.updateUserStatus({ ...input, actorId: actor.user.id });
  }
  updateRisk(
    actor: AdminActor,
    input: Omit<Parameters<AdminStore["updateRisk"]>[0], "actorId">,
  ) {
    requirePermission(actor, "RISK_WRITE");
    if (actor.user.id === input.targetId)
      throw new AdminError(
        "ADMIN_TARGET_INVALID",
        "Administrative users cannot change their own risk score",
        409,
      );
    return this.store.updateRisk({ ...input, actorId: actor.user.id });
  }

  private hashAdminToken(token: string) {
    return createHmac("sha256", this.secret)
      .update(`admin:${token}`)
      .digest("hex");
  }
}

export function adminRoles(roles: string[]): AdminRole[] {
  return roles.filter((role): role is AdminRole =>
    ADMIN_ROLES.includes(role as AdminRole),
  );
}

export function permissionsFor(roles: AdminRole[]) {
  return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
}

function sessionResponse(
  user: PublicUser,
  roles: AdminRole[],
  expiresAt: Date,
): AdminSessionResponse {
  return {
    user,
    roles,
    permissions: permissionsFor(roles),
    assurance: "PASSWORD_REAUTH",
    expiresAt: expiresAt.toISOString(),
  };
}

function requirePermission(actor: AdminActor, permission: AdminPermission) {
  if (!actor.permissions.includes(permission))
    throw new AdminError(
      "ADMIN_FORBIDDEN",
      `Permission ${permission} is required`,
      403,
    );
}
