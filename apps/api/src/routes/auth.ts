import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loginRequestSchema, registerRequestSchema } from "@fauzet/contracts";
import { AuthError, type AuthService } from "../domain/auth.js";

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
  return deviceId ? { deviceId } : {};
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthService,
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
    return reply.code(204).send();
  });
  app.get("/v1/me", async (request) => ({
    user: await auth.authenticate(tokenFrom(request)),
  }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if (error.name === "ZodError")
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          details: error,
        },
      });
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  });
}
