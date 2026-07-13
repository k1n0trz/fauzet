import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  emailRequestSchema,
  passwordResetRequestSchema,
  tokenRequestSchema,
} from "@fauzet/contracts";
import type { AuthService } from "../domain/auth.js";
import { AccountSecurityService } from "../domain/account-security.js";
import type { WelcomeBonusIssuer } from "../domain/welcome-bonus.js";

function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}
export async function registerAccountSecurityRoutes(
  app: FastifyInstance,
  auth: AuthService,
  security: AccountSecurityService,
  welcomeBonus?: WelcomeBonusIssuer,
) {
  app.post("/v1/auth/email-verification/request", async (request, reply) => {
    const user = await auth.authenticate(tokenFrom(request));
    await security.requestEmailVerification(user);
    return reply.code(202).send({ accepted: true });
  });
  app.post("/v1/auth/email-verification/confirm", async (request) => {
    const { token } = tokenRequestSchema.parse(request.body);
    const user = await security.confirmEmail(token);
    let bonusTransactionId: string | null = null;
    if (welcomeBonus && user.status === "ACTIVE") {
      try {
        bonusTransactionId = (await welcomeBonus.issue(user.id)).transactionId;
      } catch (error) {
        app.log.error(
          { error, userId: user.id },
          "Welcome bonus issuance failed",
        );
      }
    }
    return { verified: true, userId: user.id, bonusTransactionId };
  });
  app.post("/v1/auth/password/forgot", async (request, reply) => {
    const { email } = emailRequestSchema.parse(request.body);
    await security.requestPasswordReset(email);
    return reply.code(202).send({ accepted: true });
  });
  app.post("/v1/auth/password/reset", async (request) => {
    const { token, password } = passwordResetRequestSchema.parse(request.body);
    const user = await security.resetPassword(token, password);
    return { reset: true, userId: user.id };
  });
}
