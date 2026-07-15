import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  googleAuthRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
} from "@fauzet/contracts";
import {
  AuthError,
  GoogleIdentityVerificationError,
  type AuthService,
  type GoogleIdentityVerifier,
} from "../domain/auth.js";
import { AccountTokenError } from "../domain/account-security.js";
import { AdminError } from "../domain/admin.js";
import { SandboxWithdrawalError } from "../domain/sandbox-withdrawals.js";
import type { WelcomeBonusIssuer } from "../domain/welcome-bonus.js";

const COOKIE = "fz_session";

function tokenFrom(request: FastifyRequest): string | undefined {
  const bearer = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  return bearer ?? request.cookies[COOKIE];
}

function setSession(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

function sessionContext(request: FastifyRequest) {
  const deviceId = request.headers["x-device-id"]?.toString();
  return deviceId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      deviceId,
    )
    ? { deviceId }
    : {};
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthService,
  googleVerifier: GoogleIdentityVerifier | null = null,
  welcomeBonus?: WelcomeBonusIssuer,
) {
  app.post(
    "/v1/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = registerRequestSchema.parse(request.body);
      const session = await auth.register(input, sessionContext(request));
      setSession(reply, session.token, session.expiresAt);
      return reply.code(201).send({
        user: session.user,
        sessionExpiresAt: session.expiresAt.toISOString(),
      });
    },
  );
  app.post(
    "/v1/auth/google",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      if (!googleVerifier) {
        throw new AuthError(
          "Google authentication is not available",
          "GOOGLE_AUTH_UNAVAILABLE",
          503,
        );
      }
      const input = googleAuthRequestSchema.parse(request.body);
      let identity;
      try {
        identity = await googleVerifier.verify(input.idToken);
      } catch (error) {
        if (error instanceof GoogleIdentityVerificationError) {
          app.log.warn(
            {
              verificationReason: error.reason,
              providerCode: error.providerCode,
            },
            "Google identity verification rejected",
          );
          throw new AuthError(error.message, "GOOGLE_TOKEN_INVALID", 401);
        }
        throw error;
      }
      const result = await auth.loginWithGoogle(
        identity,
        input.registration,
        sessionContext(request),
      );
      setSession(reply, result.session.token, result.session.expiresAt);
      if (welcomeBonus && result.becameVerified) {
        try {
          await welcomeBonus.issue(result.session.user.id);
        } catch (error) {
          app.log.error(
            { error, userId: result.session.user.id },
            "Welcome bonus issuance after Google authentication failed",
          );
        }
      }
      return {
        user: result.session.user,
        sessionExpiresAt: result.session.expiresAt.toISOString(),
        created: result.created,
      };
    },
  );
  app.post(
    "/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const session = await auth.login(
        loginRequestSchema.parse(request.body),
        sessionContext(request),
      );
      setSession(reply, session.token, session.expiresAt);
      return {
        user: session.user,
        sessionExpiresAt: session.expiresAt.toISOString(),
      };
    },
  );
  app.post("/v1/auth/logout", async (request, reply) => {
    await auth.logout(tokenFrom(request));
    reply.clearCookie(COOKIE, { path: "/" });
    reply.clearCookie("fz_admin_session", { path: "/" });
    return reply.code(204).send();
  });
  app.get("/v1/me", async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { user: await auth.authenticate(tokenFrom(request)) };
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof AccountTokenError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof AdminError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof SandboxWithdrawalError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof Error && error.name === "ZodError")
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          details: error,
        },
      });
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({
        error: {
          code: "REQUEST_ERROR",
          message: error instanceof Error ? error.message : "Invalid request",
        },
      });
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  });
}
