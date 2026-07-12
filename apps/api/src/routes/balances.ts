import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuthService } from "../domain/auth.js";
import type { BalanceService } from "../domain/balances.js";
function tokenFrom(request: FastifyRequest) {
  return (
    request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] ??
    request.cookies.fz_session
  );
}
export async function registerBalanceRoutes(
  app: FastifyInstance,
  auth: AuthService,
  balances: BalanceService,
) {
  app.get("/v1/balances", async (request) => {
    const user = await auth.authenticate(tokenFrom(request));
    return {
      balances: await balances.forUser(user.id),
      asOf: new Date().toISOString(),
    };
  });
}
