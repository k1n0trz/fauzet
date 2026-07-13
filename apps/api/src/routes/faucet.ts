import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { claimRequestSchema, idempotencyKeySchema } from "@fauzet/contracts";
import type { AuthService } from "../domain/auth.js";
import {
  FaucetError,
  type FaucetRequestContext,
  type FaucetService,
} from "../domain/faucet.js";

export async function registerFaucetRoutes(
  app: FastifyInstance,
  auth: AuthService,
  faucet: FaucetService,
  contextSecret: string,
) {
  app.get(
    "/v1/faucet/status",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      try {
        return {
          faucet: await faucet.status(
            session.user,
            requestContext(request, contextSecret, session.context.deviceId),
          ),
        };
      } catch (error) {
        return sendFaucetError(error, reply);
      }
    },
  );

  app.post(
    "/v1/faucet/challenges",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      try {
        const challenge = await faucet.createChallenge(
          session.user,
          requestContext(request, contextSecret, session.context.deviceId),
        );
        return reply.code(201).send({ challenge });
      } catch (error) {
        return sendFaucetError(error, reply);
      }
    },
  );

  app.post(
    "/v1/faucet/claims",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      const { challengeId } = claimRequestSchema.parse(request.body);
      const idempotencyKey = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      try {
        return await faucet.claim(
          session.user,
          { challengeId, idempotencyKey },
          requestContext(request, contextSecret, session.context.deviceId),
        );
      } catch (error) {
        return sendFaucetError(error, reply);
      }
    },
  );
}

function tokenFrom(request: FastifyRequest): string | undefined {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}

function requestContext(
  request: FastifyRequest,
  secret: string,
  boundDeviceId: string | undefined,
): FaucetRequestContext {
  const suppliedDevice = request.headers["x-device-id"]?.toString();
  const deviceId =
    suppliedDevice &&
    UUID_V4.test(suppliedDevice) &&
    suppliedDevice.toLowerCase() === boundDeviceId?.toLowerCase()
      ? suppliedDevice.toLowerCase()
      : undefined;
  return {
    ipHash: createHmac("sha256", secret)
      .update(`faucet-ip:${request.ip}`)
      .digest("hex"),
    ...(deviceId === undefined ? {} : { deviceId }),
  };
}

function sendFaucetError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof FaucetError)) throw error;
  return reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
