import { z } from "zod";

const requiredTrimmedString = (schema: z.ZodString) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    schema,
  );

const reconciliationEnvSchema = z.object({
  MERCADOPAGO_MODE: z.literal("test"),
  MERCADOPAGO_ACCESS_TOKEN: requiredTrimmedString(z.string().min(20).max(512)),
  MERCADOPAGO_APPLICATION_ID: requiredTrimmedString(
    z.string().regex(/^\d{1,20}$/),
  ),
  MERCADOPAGO_SELLER_USER_ID: requiredTrimmedString(
    z.string().regex(/^\d{1,20}$/),
  ),
});

export function loadFiatReconciliationConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  const parsed = reconciliationEnvSchema.parse(env);
  return {
    mode: parsed.MERCADOPAGO_MODE,
    accessToken: parsed.MERCADOPAGO_ACCESS_TOKEN,
    applicationId: parsed.MERCADOPAGO_APPLICATION_ID,
    sellerUserId: parsed.MERCADOPAGO_SELLER_USER_ID,
  } as const;
}
