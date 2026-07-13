import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  adminRiskUpdateRequestSchema,
  adminStepUpRequestSchema,
  adminUserStatusRequestSchema,
} from "@fauzet/contracts";
import { z } from "zod";
import type { AdminService } from "../domain/admin.js";
import type { AuthService } from "../domain/auth.js";

const BASE_COOKIE = "fz_session";
const ADMIN_COOKIE = "fz_admin_session";
const usersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().min(1).max(120).optional(),
});

export async function registerAdminRoutes(
  app: FastifyInstance,
  auth: AuthService,
  admin: AdminService,
  secret: string,
) {
  app.post(
    "/v1/admin/auth/step-up",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const baseToken = tokenFrom(request);
      const baseUser = await auth.authenticate(baseToken);
      const { password } = adminStepUpRequestSchema.parse(request.body);
      const steppedUp = await admin.stepUp({
        user: baseUser,
        password,
        baseToken: requiredBaseToken(baseToken),
        requestId: request.id,
        ipHash: hashIp(request.ip, secret),
      });
      setAdminCookie(
        reply,
        steppedUp.token,
        new Date(steppedUp.session.expiresAt),
      );
      return steppedUp.session;
    },
  );

  app.get("/v1/admin/session", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return admin.session(await actor(request, auth, admin));
  });

  app.post("/v1/admin/auth/logout", async (request, reply) => {
    await admin.logout(adminTokenFrom(request));
    reply.clearCookie(ADMIN_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/v1/admin/overview", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return admin.overview(await actor(request, auth, admin));
  });
  app.get("/v1/admin/users", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const query = usersQuerySchema.parse(request.query);
    return admin.users(await actor(request, auth, admin), {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.search ? { search: query.search } : {}),
    });
  });
  app.get("/v1/admin/ledger", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return admin.ledger(await actor(request, auth, admin));
  });
  app.get("/v1/admin/audit", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return admin.audit(await actor(request, auth, admin));
  });
  app.get("/v1/admin/risk", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return admin.risk(await actor(request, auth, admin));
  });

  app.patch("/v1/admin/users/:userId/status", async (request) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params);
    const input = adminUserStatusRequestSchema.parse(request.body);
    return admin.updateUserStatus(await actor(request, auth, admin), {
      targetId: userId,
      ...input,
      requestId: request.id,
      ipHash: hashIp(request.ip, secret),
    });
  });
  app.patch("/v1/admin/users/:userId/risk", async (request) => {
    const { userId } = z
      .object({ userId: z.string().uuid() })
      .parse(request.params);
    const input = adminRiskUpdateRequestSchema.parse(request.body);
    return admin.updateRisk(await actor(request, auth, admin), {
      targetId: userId,
      ...input,
      requestId: request.id,
      ipHash: hashIp(request.ip, secret),
    });
  });
}

async function actor(
  request: FastifyRequest,
  auth: AuthService,
  admin: AdminService,
) {
  const baseToken = requiredBaseToken(tokenFrom(request));
  const adminToken = adminTokenFrom(request);
  return admin.authenticate({
    baseUser: await auth.authenticate(baseToken),
    baseToken,
    ...(adminToken ? { adminToken } : {}),
  });
}

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies[BASE_COOKIE]
  );
}

function adminTokenFrom(request: FastifyRequest) {
  return (
    request.headers["x-admin-token"]?.toString() ??
    request.cookies[ADMIN_COOKIE]
  );
}

function requiredBaseToken(token: string | undefined) {
  if (!token) return "";
  return token;
}

function setAdminCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

function hashIp(ip: string, secret: string) {
  return createHmac("sha256", secret).update(`ip:${ip}`).digest("hex");
}
