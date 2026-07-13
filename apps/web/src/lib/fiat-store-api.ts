import {
  fiatCatalogResponseSchema,
  fiatCheckoutRequestSchema,
  fiatInventoryResponseSchema,
  fiatOrderResponseSchema,
  type FiatCatalogResponse,
  type FiatCheckoutRequest,
  type FiatInventoryResponse,
  type FiatOrderResponse,
} from "@fauzet/contracts";
import { API_BASE } from "./api";
import { getDeviceId } from "./device";
import {
  ApiRequestError,
  apiRequestError,
  errorMessage,
  readJson,
} from "./reward-api";

export type FiatCatalog = FiatCatalogResponse;
export type FiatProduct = FiatCatalogResponse["products"][number];
export type FiatProductState = FiatProduct["state"];
export type FiatEntitlements = FiatInventoryResponse;
export type FiatEntitlement = FiatInventoryResponse["items"][number];
export type FiatEntitlementState = FiatEntitlement["state"];
export type FiatEffect = FiatProduct["effect"];
export type FiatCheckout = FiatCheckoutRequest;
export type FiatOrder = FiatOrderResponse;
export type FiatOrderStatus = FiatOrderResponse["order"]["status"];

export const FIAT_ORDER_MAX_POLL_ATTEMPTS = 15;

export async function fetchFiatCatalog(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/fiat/catalog`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeFiatCatalog(payload);
}

export async function fetchFiatEntitlements(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/fiat/entitlements`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeFiatEntitlements(payload);
}

export async function createFiatOrder(
  input: FiatCheckoutRequest,
  idempotencyKey: string,
) {
  const body = fiatCheckoutRequestSchema.parse(input);
  const response = await fetch(`${API_BASE}/fiat/orders`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-device-id": getDeviceId(),
    },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeFiatOrder(payload);
}

export async function fetchFiatOrder(orderId: string, signal?: AbortSignal) {
  const response = await fetch(
    `${API_BASE}/fiat/orders/${encodeURIComponent(orderId)}`,
    {
      credentials: "include",
      cache: "no-store",
      headers: { "x-device-id": getDeviceId() },
      signal: signal ?? null,
    },
  );
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeFiatOrder(payload);
}

export function normalizeFiatCatalog(payload: unknown): FiatCatalog {
  const source = record(payload);
  const compatiblePayload =
    source && source.checkoutTermsVersion === undefined
      ? {
          ...source,
          checkoutTermsVersion: "contract-upgrade-required",
          checkoutEnabled: false,
          disabledReason:
            typeof source.disabledReason === "string"
              ? source.disabledReason
              : "CHECKOUT_CONTRACT_UPGRADE_REQUIRED",
        }
      : payload;
  const result = fiatCatalogResponseSchema.safeParse(compatiblePayload);
  if (!result.success) invalid(result.error.issues[0]?.path);
  return result.data;
}

export function normalizeFiatEntitlements(payload: unknown): FiatEntitlements {
  const result = fiatInventoryResponseSchema.safeParse(payload);
  if (!result.success) invalid(result.error.issues[0]?.path);
  return result.data;
}

export function normalizeFiatOrder(payload: unknown): FiatOrder {
  const result = fiatOrderResponseSchema.safeParse(payload);
  if (!result.success) invalid(result.error.issues[0]?.path);
  if (
    result.data.order.checkout &&
    !isMercadoPagoHttps(result.data.order.checkout.url)
  ) {
    invalid(["order", "checkout", "url"]);
  }
  return result.data;
}

export function canStartFiatCheckout(
  catalog: FiatCatalog,
  product: FiatProduct,
) {
  return (
    catalog.mode === "SANDBOX" &&
    catalog.realChargeEnabled === false &&
    catalog.catalogEnabled &&
    catalog.checkoutEnabled &&
    product.state === "AVAILABLE" &&
    product.rewardEligible === false
  );
}

export function nextFiatOrderPollDelay(
  status: FiatOrderStatus,
  completedAttempts: number,
) {
  if (
    !["CREATED", "CHECKOUT_READY", "PENDING"].includes(status) ||
    completedAttempts >= FIAT_ORDER_MAX_POLL_ATTEMPTS
  ) {
    return null;
  }
  return Math.min(1_500 + completedAttempts * 250, 4_000);
}

export function fiatErrorMessage(caught: unknown) {
  if (!(caught instanceof ApiRequestError)) return errorMessage(caught);
  const messages: Record<string, string> = {
    FIAT_ACCOUNT_NOT_ELIGIBLE:
      "Necesitas una cuenta activa y verificada para usar el sandbox.",
    FIAT_CHECKOUT_DISABLED: "El checkout de prueba está cerrado temporalmente.",
    FIAT_CHECKOUT_NOT_ALLOWED:
      "Tu cuenta todavía no está habilitada para este checkout de prueba.",
    FIAT_DEVICE_REQUIRED:
      "No pudimos validar este dispositivo. Recarga la página e inténtalo de nuevo.",
    FIAT_PROVIDER_NOT_CONFIGURED:
      "Mercado Pago TEST todavía no está configurado por completo.",
    FIAT_PRODUCT_NOT_AVAILABLE:
      "Este producto ya no está disponible. Actualiza el catálogo.",
    FIAT_TERMS_CHANGED:
      "Las condiciones cambiaron. Actualiza el catálogo antes de continuar.",
    FIAT_IDEMPOTENCY_CONFLICT:
      "La solicitud no coincide con el intento anterior. Actualiza e inténtalo de nuevo.",
    FIAT_CHECKOUT_BUSY:
      "El checkout se está preparando. Espera unos segundos y reintenta.",
    FIAT_PROVIDER_UNAVAILABLE:
      "Mercado Pago TEST no respondió. Reutilizaremos el mismo intento al reintentar.",
    FIAT_PROVIDER_MISMATCH:
      "El checkout recibido no superó la verificación de seguridad.",
    FIAT_ORDER_NOT_FOUND: "No encontramos esta orden de prueba en tu cuenta.",
  };
  return caught.code
    ? (messages[caught.code] ?? caught.message)
    : caught.message;
}

function invalid(path: PropertyKey[] | undefined): never {
  const field = path?.length ? path.map(String).join(".") : "respuesta";
  throw new Error(`La respuesta fiat llegó incompleta (${field}).`);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isMercadoPagoHttps(value: string) {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    (url.hostname === "mercadopago.com" ||
      url.hostname.endsWith(".mercadopago.com") ||
      url.hostname === "mercadopago.com.co" ||
      url.hostname.endsWith(".mercadopago.com.co"))
  );
}
