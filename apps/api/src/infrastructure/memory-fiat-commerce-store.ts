import type { FiatCommerceStore } from "../domain/fiat-commerce.js";
import {
  FIAT_ACTIVATION_CONSENT_VERSION,
  FIAT_CATALOG_PRODUCTS,
  FIAT_CHECKOUT_TERMS_VERSION,
  FIAT_REFUND_POLICY_VERSION,
} from "../domain/fiat-catalog.js";

export class MemoryFiatCommerceStore implements FiatCommerceStore {
  async catalog({ flags }: Parameters<FiatCommerceStore["catalog"]>[0]) {
    const serverNow = new Date().toISOString();
    return {
      serverNow,
      mode: "SANDBOX" as const,
      realChargeEnabled: false as const,
      provider: "MERCADO_PAGO" as const,
      checkoutTermsVersion: FIAT_CHECKOUT_TERMS_VERSION,
      catalogEnabled: flags.catalogEnabled,
      checkoutEnabled: flags.checkoutEnabled,
      activationEnabled: flags.activationEnabled,
      currency: "COP" as const,
      exponent: 0 as const,
      disabledReason: flags.checkoutEnabled ? null : "CHECKOUT_DISABLED",
      products: FIAT_CATALOG_PRODUCTS.map((product) => ({
        productVersionId: product.productVersionId,
        sku: product.sku,
        version: product.version,
        kind: product.kind,
        state: product.sandboxReady
          ? ("DISABLED" as const)
          : ("COMING_SOON" as const),
        reasonCode: product.sandboxReady
          ? flags.checkoutEnabled
            ? "PRODUCT_PAUSED"
            : "CHECKOUT_DISABLED"
          : "PRODUCT_COMING_SOON",
        name: product.name,
        description: product.description,
        price: {
          currency: "COP" as const,
          minorUnits: product.priceMinorUnits,
          exponent: 0 as const,
        },
        durationSeconds: product.durationSeconds,
        effect: product.effect,
        rewardEligible: false as const,
        refundPolicyVersion: FIAT_REFUND_POLICY_VERSION,
        activationConsentVersion: FIAT_ACTIVATION_CONSENT_VERSION,
      })),
    };
  }

  async inventory({ flags }: Parameters<FiatCommerceStore["inventory"]>[0]) {
    return {
      serverNow: new Date().toISOString(),
      activationEnabled: flags.activationEnabled,
      items: [],
    };
  }
}
