import { API_BASE } from "./api";
import { getDeviceId } from "./device";
import {
  apiRequestError,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  readJson,
} from "./reward-api";

export type StoreProductState =
  | "AVAILABLE"
  | "LOCKED"
  | "ACTIVE"
  | "LIMIT_REACHED"
  | "NO_SLOT"
  | "DISABLED";

export type StoreProduct = {
  id: string;
  kind: string;
  state: StoreProductState;
  reasonCode: string | null;
  name: string;
  description: string;
  meta: string;
  effectLabel: string;
  price: { asset: string; minorUnits: string };
  effect: {
    type: string;
    label: string;
    durationSeconds: number | null;
    multiplierBps: number | null;
    energyTo: number | null;
  };
  limits: {
    perUtcDay: number | null;
    remainingToday: number | null;
    maxActive: number | null;
    requiresSlot: boolean;
  };
};

export type StoreCatalog = {
  configVersion: number;
  paymentBalances: { AVAILABLE: string; PROMOTIONAL: string };
  paymentOrder: Array<"AVAILABLE" | "PROMOTIONAL">;
  splitBps: { burn: number; recycle: number; treasury: number };
  products: StoreProduct[];
};

export type PurchaseReceipt = {
  id: string;
  productId: string;
  status: string;
  quantity: number;
  total: { asset: string; minorUnits: string };
  payment: {
    promotionalMinorUnits: string;
    availableMinorUnits: string;
  };
  split: {
    burnMinorUnits: string;
    recycleMinorUnits: string;
    treasuryMinorUnits: string;
  };
  transactionId: string | null;
  configVersion: number;
  effectLabel: string | null;
  replayed: boolean;
};

const productStates = new Set<StoreProductState>([
  "AVAILABLE",
  "LOCKED",
  "ACTIVE",
  "LIMIT_REACHED",
  "NO_SLOT",
  "DISABLED",
]);

export async function fetchStoreCatalog(signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/store/catalog`, {
    credentials: "include",
    cache: "no-store",
    headers: { "x-device-id": getDeviceId() },
    signal: signal ?? null,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizeStoreCatalog(payload);
}

export async function purchaseStoreProduct(
  productId: string,
  configVersion: number,
  idempotencyKey: string,
) {
  const response = await fetch(`${API_BASE}/store/purchases`, {
    method: "POST",
    credentials: "include",
    headers: mutationHeaders(idempotencyKey),
    body: JSON.stringify({ productId, configVersion }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return normalizePurchaseReceipt(payload, productId);
}

export function isConfirmedPurchase(receipt: PurchaseReceipt) {
  return (
    receipt.status === "POSTED" &&
    Boolean(receipt.transactionId) &&
    Boolean(receipt.effectLabel)
  );
}

function normalizeStoreCatalog(payload: unknown): StoreCatalog {
  const root = asRecord(payload);
  const source = asRecord(root?.catalog) ?? root;
  const balances =
    asRecord(source?.balances) ?? asRecord(source?.paymentBalances);
  const split = asRecord(source?.split);
  const configVersion = asNumber(source?.configVersion);
  const available =
    asString(balances?.availableMinorUnits) ?? asString(balances?.AVAILABLE);
  const promotional =
    asString(balances?.promotionalMinorUnits) ??
    asString(balances?.PROMOTIONAL);
  const burnBps = asNumber(split?.burnBps);
  const recycleBps = asNumber(split?.recycleBps);
  const rewardPoolsBps = asNumber(split?.rewardPoolsBps);
  const treasuryBps = asNumber(split?.treasuryBps);
  const rawOrder = Array.isArray(source?.paymentOrder)
    ? source.paymentOrder
    : [];
  const paymentOrder = rawOrder.filter(
    (bucket): bucket is "AVAILABLE" | "PROMOTIONAL" =>
      bucket === "AVAILABLE" || bucket === "PROMOTIONAL",
  );
  const rawProducts = Array.isArray(source?.items)
    ? source.items
    : Array.isArray(source?.products)
      ? source.products
      : [];
  const products = rawProducts
    .map(normalizeStoreProduct)
    .filter((product): product is StoreProduct => product !== null);

  if (
    !source ||
    configVersion === null ||
    !available ||
    !promotional ||
    burnBps === null ||
    (recycleBps ?? rewardPoolsBps) === null ||
    treasuryBps === null ||
    paymentOrder.length === 0 ||
    products.length === 0
  ) {
    throw new Error("El catálogo de la tienda llegó incompleto.");
  }

  return {
    configVersion,
    paymentBalances: { AVAILABLE: available, PROMOTIONAL: promotional },
    paymentOrder,
    splitBps: {
      burn: burnBps,
      recycle: recycleBps ?? rewardPoolsBps!,
      treasury: treasuryBps,
    },
    products,
  };
}

function normalizeStoreProduct(value: unknown): StoreProduct | null {
  const product = asRecord(value);
  const id = asString(product?.id);
  if (!product || !id) return null;
  const presentation = productPresentation(id);
  const price = asRecord(product.price);
  const effect = asRecord(product.effect);
  const limits = asRecord(product.limits);
  const rawState = asString(product.state)?.toUpperCase();
  const remainingToday =
    asNumber(product.remainingToday) ?? asNumber(limits?.remainingToday);
  const state =
    rawState && productStates.has(rawState as StoreProductState)
      ? (rawState as StoreProductState)
      : asBoolean(product.enabled) === false
        ? "LOCKED"
        : remainingToday === 0
          ? "LIMIT_REACHED"
          : "AVAILABLE";
  const asset = asString(price?.asset);
  const priceAsset = asset ?? "ZYXE";
  const minorUnits =
    asString(product.priceMinorUnits) ?? asString(price?.minorUnits);

  if (!minorUnits || !effect) return null;

  return {
    id,
    kind:
      asString(product.category) ?? asString(product.kind) ?? presentation.kind,
    state,
    reasonCode: asString(product.lockedReason) ?? asString(product.reasonCode),
    name: asString(product.name) ?? presentation.name,
    description: asString(product.description) ?? presentation.description,
    meta: asString(product.meta) ?? presentation.meta,
    effectLabel: asString(effect.label) ?? presentation.effectLabel,
    price: { asset: priceAsset, minorUnits },
    effect: {
      type: asString(effect.kind) ?? asString(effect.type) ?? "UNKNOWN",
      label: asString(effect.label) ?? presentation.effectLabel,
      durationSeconds: asNumber(effect.durationSeconds),
      multiplierBps: asNumber(effect.multiplierBps),
      energyTo: asNumber(effect.energyTo),
    },
    limits: {
      perUtcDay: asNumber(effect.maxPerDay) ?? asNumber(limits?.perUtcDay),
      remainingToday,
      maxActive: asNumber(limits?.maxActive),
      requiresSlot:
        asRecord(effect.miner) !== null ||
        asBoolean(limits?.requiresSlot) === true,
    },
  };
}

function normalizePurchaseReceipt(
  payload: unknown,
  productId: string,
): PurchaseReceipt {
  const root = asRecord(payload);
  const source = asRecord(root?.purchase) ?? asRecord(root?.receipt) ?? root;
  const id = asString(source?.id);
  const price = asRecord(source?.price);
  const payment = asRecord(source?.debits) ?? asRecord(source?.payment);
  const split = asRecord(source?.split);
  const effect = asRecord(source?.effect);
  const status = asString(source?.status);
  const asset = asString(price?.asset) ?? "ZYXE";
  const priceMinorUnits =
    asString(source?.totalMinorUnits) ?? asString(price?.minorUnits);
  const promotionalMinorUnits = asString(payment?.promotionalMinorUnits);
  const availableMinorUnits = asString(payment?.availableMinorUnits);
  const burnMinorUnits = asString(split?.burnMinorUnits);
  const recycleMinorUnits =
    asString(split?.recycleMinorUnits) ??
    asString(split?.rewardPoolsMinorUnits);
  const treasuryMinorUnits = asString(split?.treasuryMinorUnits);
  const configVersion = asNumber(source?.configVersion);

  if (
    !source ||
    !id ||
    !status ||
    !asset ||
    !priceMinorUnits ||
    !promotionalMinorUnits ||
    !availableMinorUnits ||
    !burnMinorUnits ||
    !recycleMinorUnits ||
    !treasuryMinorUnits ||
    configVersion === null
  ) {
    throw new Error("El servidor no devolvió un comprobante de compra válido.");
  }

  return {
    id,
    productId:
      asString(source.itemId) ?? asString(source.productId) ?? productId,
    status,
    quantity: asNumber(source.quantity) ?? 1,
    total: { asset, minorUnits: priceMinorUnits },
    payment: { promotionalMinorUnits, availableMinorUnits },
    split: { burnMinorUnits, recycleMinorUnits, treasuryMinorUnits },
    transactionId: asString(source.transactionId),
    configVersion,
    effectLabel: effect
      ? (asString(effect.label) ?? productPresentation(productId).effectLabel)
      : null,
    replayed: asBoolean(root?.replayed) === true,
  };
}

function mutationHeaders(idempotencyKey: string) {
  return {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
    "x-device-id": getDeviceId(),
  };
}

function productPresentation(id: string) {
  return (
    (
      {
        b1: {
          kind: "UTILITY",
          name: "Recarga de energía de minería",
          description:
            "Restaura la energía exclusiva de minería según la regla vigente.",
          meta: "Instantáneo · con límite diario",
          effectLabel: "Energía restaurada",
        },
        b2: {
          kind: "BOOST",
          name: "Boost de hashpower ×1.5",
          description: "Aumenta temporalmente el hashpower válido.",
          meta: "Temporal · no acumulable",
          effectLabel: "×1.5 hashpower",
        },
        b3: {
          kind: "BOOST",
          name: "Acelerador de cooldown",
          description: "Reducción temporal del cooldown del faucet.",
          meta: "Bloqueado en esta fase",
          effectLabel: "Cooldown reducido",
        },
        b4: {
          kind: "UTILITY",
          name: "Kit de reparación",
          description: "Repara un minero elegible según las reglas vigentes.",
          meta: "Un uso · requiere minero elegible",
          effectLabel: "Durabilidad restaurada",
        },
        b5: {
          kind: "PREMIUM",
          name: "Pase de misión premium",
          description: "Acceso temporal a misiones patrocinadas premium.",
          meta: "Bloqueado en esta fase",
          effectLabel: "Misiones premium",
        },
        b6: {
          kind: "MINER",
          name: "Nova Rig II",
          description: "Minero virtual permanente de alta eficiencia.",
          meta: "Permanente · requiere slot",
          effectLabel: "Nuevo minero",
        },
      } as const
    )[id] ?? {
      kind: "UTILITY",
      name: id,
      description: "Utilidad interna configurada por Fauzet.",
      meta: "Condiciones definidas por el servidor",
      effectLabel: "Efecto configurado",
    }
  );
}
