import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  idempotencyKeySchema,
  missionClaimRequestSchema,
} from "@fauzet/contracts";
import type { AuthService } from "../domain/auth.js";
import type { GameContext } from "../domain/games.js";
import { MissionError, type MissionService } from "../domain/missions.js";

const missionParamsSchema = z.object({ missionId: z.string().min(1).max(64) });

export async function registerMissionRoutes(
  app: FastifyInstance,
  auth: AuthService,
  missions: MissionService,
  contextSecret: string,
) {
  app.get("/v1/missions", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const session = await auth.authenticateSession(tokenFrom(request));
    try {
      return await missions.catalog(session.user);
    } catch (error) {
      return sendMissionError(error, reply);
    }
  });

  app.post(
    "/v1/missions/:missionId/claim",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const session = await auth.authenticateSession(tokenFrom(request));
      const { missionId } = missionParamsSchema.parse(request.params);
      const { periodKey, configVersion } = missionClaimRequestSchema.parse(
        request.body,
      );
      const idempotencyKey = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      try {
        return await missions.claim(
          session.user,
          missionId,
          periodKey,
          configVersion,
          idempotencyKey,
          requestContext(request, contextSecret, session.context.deviceId),
        );
      } catch (error) {
        return sendMissionError(error, reply);
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
): GameContext {
  const supplied = request.headers["x-device-id"]?.toString();
  const deviceId =
    supplied &&
    UUID_V4.test(supplied) &&
    supplied.toLowerCase() === boundDeviceId?.toLowerCase()
      ? supplied.toLowerCase()
      : undefined;
  return {
    ipHash: createHmac("sha256", secret)
      .update(`missions-ip:${request.ip}`)
      .digest("hex"),
    ...(deviceId ? { deviceId } : {}),
  };
}

function sendMissionError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof MissionError)) throw error;
  return reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
