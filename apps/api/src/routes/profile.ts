import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth.js";
import { hashSessionToken } from "../domain/auth.js";
import {
  PrismaProfileStore,
  ProfileConflictError,
} from "../infrastructure/prisma-profile-store.js";

const nullableText = (max: number) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().min(1).max(max).nullable().optional(),
  );

const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    locale: z.enum(["es", "en"]).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    username: z.preprocess(
      (value) => (value === "" ? null : value),
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9_]{3,30}$/)
        .nullable()
        .optional(),
    ),
    firstName: nullableText(80),
    lastName: nullableText(80),
    phone: z.preprocess(
      (value) => (value === "" ? null : value),
      z
        .string()
        .trim()
        .regex(/^\+?[0-9 ()-]{7,24}$/)
        .nullable()
        .optional(),
    ),
    birthDate: z.preprocess(
      (value) => (value === "" ? null : value),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
    ),
    timezone: z.string().trim().min(3).max(64).optional(),
    theme: z.enum(["DARK", "LIGHT", "SYSTEM"]).optional(),
    addressLine1: nullableText(160),
    addressLine2: nullableText(160),
    city: nullableText(100),
    region: nullableText(100),
    postalCode: nullableText(24),
    billingName: nullableText(140),
    billingTaxId: nullableText(60),
    billingEmail: z.preprocess(
      (value) => (value === "" ? null : value),
      z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    ),
    marketingEmails: z.boolean().optional(),
    productEmails: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

const avatarSchema = z.object({
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().min(20).max(700_000),
});

const sessionParamsSchema = z.object({ id: z.string().uuid() });

export async function registerProfileRoutes(
  app: FastifyInstance,
  auth: AuthService,
  sessionSecret: string,
  store = new PrismaProfileStore(),
) {
  app.get("/v1/me/profile", async (request, reply) => {
    noStore(reply);
    const context = await profileContext(request, auth, sessionSecret);
    return store.get(context.userId, context.tokenHash);
  });

  app.patch("/v1/me/profile", async (request, reply) => {
    noStore(reply);
    const context = await profileContext(request, auth, sessionSecret);
    try {
      await store.update(
        context.userId,
        profileUpdateSchema.parse(request.body),
      );
    } catch (error) {
      if (error instanceof ProfileConflictError) {
        return reply.code(409).send({
          error: { code: "USERNAME_TAKEN", message: error.message },
        });
      }
      throw error;
    }
    return store.get(context.userId, context.tokenHash);
  });

  app.get("/v1/me/avatar", async (request, reply) => {
    const context = await profileContext(request, auth, sessionSecret);
    const avatar = await store.avatar(context.userId);
    if (!avatar?.avatarData || !avatar.avatarMime) {
      return reply.code(404).send({
        error: { code: "AVATAR_NOT_FOUND", message: "Avatar not found" },
      });
    }
    reply.header("cache-control", "private, max-age=300");
    reply.header("x-content-type-options", "nosniff");
    return reply.type(avatar.avatarMime).send(Buffer.from(avatar.avatarData));
  });

  app.put(
    "/v1/me/avatar",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
      noStore(reply);
      const context = await profileContext(request, auth, sessionSecret);
      const input = avatarSchema.parse(request.body);
      const data = Buffer.from(input.dataBase64, "base64");
      if (data.length > 500_000 || !matchesMime(data, input.mime)) {
        return reply.code(400).send({
          error: {
            code: "AVATAR_INVALID",
            message:
              "La imagen debe ser PNG, JPEG o WebP y pesar máximo 500 KB",
          },
        });
      }
      await store.setAvatar(context.userId, input.mime, data);
      return { uploaded: true };
    },
  );

  app.delete("/v1/me/avatar", async (request, reply) => {
    noStore(reply);
    const context = await profileContext(request, auth, sessionSecret);
    await store.setAvatar(context.userId, null, null);
    return reply.code(204).send();
  });

  app.delete("/v1/me/sessions/:id", async (request, reply) => {
    noStore(reply);
    const context = await profileContext(request, auth, sessionSecret);
    const { id } = sessionParamsSchema.parse(request.params);
    const current = (
      await store.get(context.userId, context.tokenHash)
    ).sessions.find((session) => session.id === id && session.current);
    await store.revokeSession(context.userId, id);
    if (current) reply.clearCookie("fz_session", { path: "/" });
    return reply.code(204).send();
  });

  app.delete("/v1/me/sessions", async (request, reply) => {
    noStore(reply);
    const context = await profileContext(request, auth, sessionSecret);
    const result = await store.revokeOtherSessions(
      context.userId,
      context.tokenHash,
    );
    return { revoked: result.count };
  });

  app.post("/v1/me/closure-request", async (request, reply) => {
    noStore(reply);
    const context = await profileContext(request, auth, sessionSecret);
    await store.requestClosure(context.userId, true);
    return { requested: true };
  });

  app.delete("/v1/me/closure-request", async (request, reply) => {
    noStore(reply);
    const context = await profileContext(request, auth, sessionSecret);
    await store.requestClosure(context.userId, false);
    return { requested: false };
  });
}

async function profileContext(
  request: FastifyRequest,
  auth: AuthService,
  sessionSecret: string,
) {
  const token = tokenFrom(request);
  const session = await auth.authenticateSession(token);
  return {
    userId: session.user.id,
    tokenHash: hashSessionToken(token!, sessionSecret),
  };
}

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}

function matchesMime(data: Buffer, mime: string) {
  if (mime === "image/png")
    return data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg") return data[0] === 0xff && data[1] === 0xd8;
  return (
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function noStore(reply: FastifyReply) {
  reply.header("cache-control", "no-store");
}
