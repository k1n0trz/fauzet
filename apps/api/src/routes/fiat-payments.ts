import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  fiatCheckoutRequestSchema,
  idempotencyKeySchema,
} from "@fauzet/contracts";
import type { AuthService } from "../domain/auth.js";
import {
  FiatPaymentError,
  type FiatPaymentService,
} from "../domain/fiat-payments.js";

const orderParamsSchema = z.object({ id: z.string().uuid() });
const webhookQuerySchema = z
  .object({
    "data.id": z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export async function registerFiatPaymentRoutes(
  app: FastifyInstance,
  auth: AuthService,
  payments: FiatPaymentService,
) {
  app.post(
    "/v1/fiat/orders",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      noStore(reply);
      const session = await auth.authenticateSession(tokenFrom(request));
      const body = fiatCheckoutRequestSchema.parse(request.body);
      const idempotencyKey = idempotencyKeySchema.parse(
        request.headers["idempotency-key"],
      );
      try {
        const result = await payments.checkout(
          session.user,
          body,
          idempotencyKey,
          boundDevice(request, session.context.deviceId),
        );
        return reply.code(result.replayed ? 200 : 201).send(result);
      } catch (error) {
        return send(error, reply);
      }
    },
  );

  app.get("/v1/fiat/orders/:id", async (request, reply) => {
    noStore(reply);
    const session = await auth.authenticateSession(tokenFrom(request));
    const { id } = orderParamsSchema.parse(request.params);
    try {
      return await payments.order(session.user, id);
    } catch (error) {
      return send(error, reply);
    }
  });

  app.post(
    "/v1/fiat/webhooks/mercadopago",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (request, reply) => {
      noStore(reply);
      const query = webhookQuerySchema.parse(request.query);
      try {
        const result = await payments.webhook({
          dataId: query["data.id"],
          queryType: query.type,
          xRequestId: header(request, "x-request-id"),
          xSignature: header(request, "x-signature"),
          payload: request.body,
        });
        return reply.code(200).send(result);
      } catch (error) {
        return send(error, reply);
      }
    },
  );
}

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}

function boundDevice(request: FastifyRequest, bound: string | undefined) {
  const supplied = header(request, "x-device-id");
  return supplied &&
    UUID_V4.test(supplied) &&
    supplied.toLowerCase() === bound?.toLowerCase()
    ? supplied.toLowerCase()
    : undefined;
}

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value?.toString();
}

function noStore(reply: FastifyReply) {
  reply.header("cache-control", "no-store");
}

function send(error: unknown, reply: FastifyReply) {
  if (!(error instanceof FiatPaymentError)) throw error;
  return reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    },
  });
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
