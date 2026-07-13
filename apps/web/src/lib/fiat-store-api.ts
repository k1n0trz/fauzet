import {
  fiatCatalogResponseSchema,
  fiatInventoryResponseSchema,
  type FiatCatalogResponse,
  type FiatInventoryResponse,
} from "@fauzet/contracts";
import { API_BASE } from "./api";
import { getDeviceId } from "./device";
import { apiRequestError, readJson } from "./reward-api";

export type FiatCatalog = FiatCatalogResponse;
export type FiatProduct = FiatCatalogResponse["products"][number];
export type FiatProductState = FiatProduct["state"];
export type FiatEntitlements = FiatInventoryResponse;
export type FiatEntitlement = FiatInventoryResponse["items"][number];
export type FiatEntitlementState = FiatEntitlement["state"];
export type FiatEffect = FiatProduct["effect"];

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

export function normalizeFiatCatalog(payload: unknown): FiatCatalog {
  const result = fiatCatalogResponseSchema.safeParse(payload);
  if (!result.success) invalid(result.error.issues[0]?.path);
  return result.data;
}

export function normalizeFiatEntitlements(payload: unknown): FiatEntitlements {
  const result = fiatInventoryResponseSchema.safeParse(payload);
  if (!result.success) invalid(result.error.issues[0]?.path);
  return result.data;
}

function invalid(path: PropertyKey[] | undefined): never {
  const field = path?.length ? path.map(String).join(".") : "respuesta";
  throw new Error(`La respuesta fiat llegó incompleta (${field}).`);
}
