import type {
  FiatCatalogResponse,
  FiatInventoryResponse,
} from "@fauzet/contracts";
import { getDatabase, type PrismaClient } from "@fauzet/database";
import type { FiatCommerceStore } from "../domain/fiat-commerce.js";
import {
  FIAT_ACTIVATION_CONSENT_VERSION,
  FIAT_CHECKOUT_TERMS_VERSION,
} from "../domain/fiat-catalog.js";

export class PrismaFiatCommerceStore implements FiatCommerceStore {
  constructor(
    private readonly database: PrismaClient = getDatabase(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async catalog({
    flags,
  }: Parameters<
    FiatCommerceStore["catalog"]
  >[0]): Promise<FiatCatalogResponse> {
    const now = this.clock();
    const products = await this.database.fiatProductVersion.findMany({
      where: {
        currency: "COP",
        status: { in: ["ACTIVE", "PAUSED", "COMING_SOON"] },
      },
      orderBy: [{ displayOrder: "asc" }, { sku: "asc" }],
    });

    return {
      serverNow: now.toISOString(),
      mode: "SANDBOX",
      realChargeEnabled: false,
      provider: "MERCADO_PAGO",
      checkoutTermsVersion: FIAT_CHECKOUT_TERMS_VERSION,
      catalogEnabled: flags.catalogEnabled,
      checkoutEnabled: flags.checkoutEnabled,
      activationEnabled: flags.activationEnabled,
      currency: "COP",
      exponent: 0,
      disabledReason: flags.checkoutEnabled ? null : "CHECKOUT_DISABLED",
      products: products.map((product) => {
        const saleStarted =
          product.saleStartsAt === null || product.saleStartsAt <= now;
        const saleOpen =
          product.saleEndsAt === null || product.saleEndsAt > now;
        const isAvailable =
          product.status === "ACTIVE" &&
          flags.checkoutEnabled &&
          saleStarted &&
          saleOpen;
        const isComingSoon = product.status === "COMING_SOON";
        return {
          productVersionId: product.id,
          sku: product.sku,
          version: product.version,
          kind: product.kind,
          state: isAvailable
            ? ("AVAILABLE" as const)
            : isComingSoon
              ? ("COMING_SOON" as const)
              : ("DISABLED" as const),
          reasonCode: catalogReason({
            status: product.status,
            checkoutEnabled: flags.checkoutEnabled,
            saleStarted,
            saleOpen,
          }),
          name: product.name,
          description: product.description,
          price: {
            currency: "COP" as const,
            minorUnits: product.unitAmountMinor.toFixed(0),
            exponent: 0 as const,
          },
          durationSeconds: product.durationSeconds,
          effect: effect(
            product.effectType,
            product.effectConfig,
            product.content,
          ),
          rewardEligible: false as const,
          refundPolicyVersion: product.refundPolicyVersion,
          activationConsentVersion: FIAT_ACTIVATION_CONSENT_VERSION,
        };
      }),
    };
  }

  async inventory({
    userId,
    flags,
  }: Parameters<
    FiatCommerceStore["inventory"]
  >[0]): Promise<FiatInventoryResponse> {
    const items = await this.database.entitlement.findMany({
      where: { order: { userId } },
      include: { order: { include: { productVersion: true } } },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
    });

    return {
      serverNow: this.clock().toISOString(),
      activationEnabled: flags.activationEnabled,
      items: items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productVersionId: item.order.productVersionId,
        sku: item.order.productVersion.sku,
        name: item.order.productVersion.name,
        state: item.status,
        quantity: item.order.quantity,
        purchasedAt: item.purchasedAt.toISOString(),
        activatedAt: item.activatedAt?.toISOString() ?? null,
        startsAt: item.startsAt?.toISOString() ?? null,
        endsAt: item.endsAt?.toISOString() ?? null,
        canActivate: false,
        canRequestRefund: false,
        reasonCode:
          item.status === "PURCHASED"
            ? flags.activationEnabled
              ? "ACTIVATION_NOT_IMPLEMENTED"
              : "ACTIVATION_DISABLED"
            : null,
        effect: effect(item.effectType, item.effectSnapshot),
      })),
    };
  }
}

function catalogReason(input: {
  status: "DRAFT" | "COMING_SOON" | "ACTIVE" | "PAUSED" | "RETIRED";
  checkoutEnabled: boolean;
  saleStarted: boolean;
  saleOpen: boolean;
}) {
  if (input.status === "COMING_SOON") return "PRODUCT_COMING_SOON";
  if (input.status !== "ACTIVE")
    return input.checkoutEnabled ? "PRODUCT_PAUSED" : "CHECKOUT_DISABLED";
  if (!input.checkoutEnabled) return "CHECKOUT_DISABLED";
  if (!input.saleStarted) return "SALE_NOT_STARTED";
  if (!input.saleOpen) return "SALE_ENDED";
  return null;
}

function effect(type: string, input: unknown, content?: unknown) {
  const source = asRecord(input);
  const localized = asRecord(asRecord(content)?.es);
  const rawParameters = asRecord(source?.parameters) ?? source ?? {};
  return {
    type,
    label:
      typeof source?.label === "string" && source.label.length > 0
        ? source.label
        : typeof localized?.effect === "string" && localized.effect.length > 0
          ? localized.effect
          : type,
    parameters: Object.fromEntries(
      Object.entries(rawParameters).filter(
        (entry): entry is [string, Primitive] => isPrimitive(entry[1]),
      ),
    ),
  };
}

type Primitive = string | number | boolean | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
