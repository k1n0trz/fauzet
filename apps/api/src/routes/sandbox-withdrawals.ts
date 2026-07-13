import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  idempotencyKeySchema,
  sandboxConversionRequestSchema,
  sandboxQuoteRequestSchema,
  sandboxWalletRequestSchema,
  sandboxWithdrawalRequestSchema,
  sandboxWithdrawalChallengeRequestSchema,
} from "@fauzet/contracts";
import type { AuthService } from "../domain/auth.js";
import {
  SandboxWithdrawalError,
  type SandboxWithdrawalService,
} from "../domain/sandbox-withdrawals.js";

const conversionParamsSchema = z.object({ id: z.string().uuid() });

export async function registerSandboxWithdrawalRoutes(
  app: FastifyInstance,
  auth: AuthService,
  sandbox: SandboxWithdrawalService,
) {
  app.get("/v1/sandbox", async (request, reply) => {
    noStore(reply);
    const session = await auth.authenticateSession(tokenFrom(request));
    return sandbox.status(session.user.id);
  });

  app.post(
    "/v1/external-wallets/sandbox",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      noStore(reply);
      const session = await auth.authenticateSession(tokenFrom(request));
      const input = sandboxWalletRequestSchema.parse(request.body);
      return reply
        .code(201)
        .send(await sandbox.createWallet(session.user.id, input));
    },
  );

  app.post(
    "/v1/conversion-quotes/sandbox",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      noStore(reply);
      const session = await auth.authenticateSession(tokenFrom(request));
      const input = sandboxQuoteRequestSchema.parse(request.body);
      return sandbox.quote(session.user.id, {
        asset: input.asset,
        eligibleMinor: BigInt(input.eligibleMinorUnits),
      });
    },
  );

  app.post(
    "/v1/conversions/sandbox",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      noStore(reply);
      const session = await auth.authenticateSession(tokenFrom(request));
      const input = sandboxConversionRequestSchema.parse(request.body);
      const idempotencyKey = keyFrom(request);
      return reply.code(201).send(
        await sandbox.convert(session.user.id, {
          quoteId: input.quoteId,
          idempotencyKey,
        }),
      );
    },
  );

  app.post(
    "/v1/withdrawals/sandbox/challenges",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      noStore(reply);
      const session = await auth.authenticateSession(tokenFrom(request));
      const input = sandboxWithdrawalChallengeRequestSchema.parse(request.body);
      return reply
        .code(201)
        .send(await sandbox.challenge(session.user.id, input));
    },
  );

  app.post(
    "/v1/withdrawals/sandbox",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      noStore(reply);
      const session = await auth.authenticateSession(tokenFrom(request));
      const input = sandboxWithdrawalRequestSchema.parse(request.body);
      return reply.code(201).send(
        await sandbox.withdraw(session.user.id, {
          ...input,
          idempotencyKey: keyFrom(request),
        }),
      );
    },
  );

  app.post(
    "/v1/conversions/:id/cancel",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      noStore(reply);
      const session = await auth.authenticateSession(tokenFrom(request));
      const { id } = conversionParamsSchema.parse(request.params);
      return sandbox.cancel(session.user.id, {
        conversionId: id,
        idempotencyKey: keyFrom(request),
      });
    },
  );
}

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}

function keyFrom(request: FastifyRequest) {
  return idempotencyKeySchema.parse(request.headers["idempotency-key"]);
}

function noStore(reply: FastifyReply) {
  reply.header("cache-control", "no-store");
}

export function sendSandboxError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof SandboxWithdrawalError)) throw error;
  return reply.code(error.statusCode).send({
    error: { code: error.code, message: error.message },
  });
}
