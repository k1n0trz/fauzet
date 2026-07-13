import { getDatabase } from "@fauzet/database";
import { FiatPaymentService } from "../domain/fiat-payments.js";
import { loadFiatReconciliationConfig } from "../fiat-reconciliation-config.js";
import { MercadoPagoGateway } from "../infrastructure/mercadopago-gateway.js";
import { PrismaFiatPaymentStore } from "../infrastructure/prisma-fiat-payment-store.js";

const config = loadFiatReconciliationConfig();

const database = getDatabase();
try {
  const service = new FiatPaymentService(
    new PrismaFiatPaymentStore(database),
    new MercadoPagoGateway({
      accessToken: config.accessToken,
      mode: config.mode,
    }),
    {
      checkoutEnabled: false,
      checkoutAllowedUsers: [],
      mode: config.mode,
      appBaseUrl: "https://reconciliation.invalid",
      sellerUserId: config.sellerUserId,
      applicationId: config.applicationId,
    },
  );
  const result = await service.reconcile(
    Number.parseInt(process.env.FIAT_RECONCILIATION_BATCH_SIZE ?? "50", 10),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await database.$disconnect();
}
