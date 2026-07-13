import {
  sandboxConversionResponseSchema,
  sandboxQuoteResponseSchema,
  sandboxStatusResponseSchema,
  sandboxWithdrawalResponseSchema,
  sandboxWithdrawalChallengeResponseSchema,
  type SandboxConversionResponse,
  type SandboxQuoteResponse,
  type SandboxStatusResponse,
  type SandboxWithdrawalResponse,
  type SandboxWithdrawalChallengeResponse,
} from "@fauzet/contracts";
import { API_BASE } from "./api";
import { apiRequestError, readJson } from "./reward-api";

export type {
  SandboxConversionResponse,
  SandboxQuoteResponse,
  SandboxStatusResponse,
  SandboxWithdrawalResponse,
  SandboxWithdrawalChallengeResponse,
};

export function fetchSandboxStatus(signal?: AbortSignal) {
  return request(
    "/sandbox",
    { method: "GET", signal: signal ?? null },
    sandboxStatusResponseSchema.parse,
  );
}

export function createSandboxWallet(input: {
  network: "SANDBOX_LTC" | "SANDBOX_DOGE";
  address: string;
  label: string;
}) {
  return request(
    "/external-wallets/sandbox",
    mutation(input),
    sandboxStatusResponseSchema.parse,
  );
}

export function createSandboxQuote(input: {
  asset: "SANDBOX_LTC" | "SANDBOX_DOGE";
  eligibleMinorUnits: string;
}) {
  return request(
    "/conversion-quotes/sandbox",
    mutation(input),
    sandboxQuoteResponseSchema.parse,
  );
}

export function reserveSandboxConversion(
  quoteId: string,
  idempotencyKey: string,
) {
  return request(
    "/conversions/sandbox",
    mutation({ quoteId }, idempotencyKey),
    sandboxConversionResponseSchema.parse,
  );
}

export function confirmSandboxWithdrawal(
  input: {
    conversionId: string;
    walletId: string;
    password: string;
    challengeId: string;
    code: string;
  },
  idempotencyKey: string,
) {
  return request(
    "/withdrawals/sandbox",
    mutation(input, idempotencyKey),
    sandboxWithdrawalResponseSchema.parse,
  );
}

export function requestSandboxWithdrawalCode(input: {
  conversionId: string;
  walletId: string;
}) {
  return request(
    "/withdrawals/sandbox/challenges",
    mutation(input),
    sandboxWithdrawalChallengeResponseSchema.parse,
  );
}

export function cancelSandboxConversion(
  conversionId: string,
  idempotencyKey: string,
) {
  return request(
    `/conversions/${conversionId}/cancel`,
    mutation({}, idempotencyKey),
    sandboxConversionResponseSchema.parse,
  );
}

async function request<T>(
  path: string,
  init: RequestInit,
  parse: (payload: unknown) => T,
) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });
  const payload = await readJson(response);
  if (!response.ok) throw apiRequestError(payload, response.status);
  return parse(payload);
}

function mutation(body: unknown, idempotencyKey?: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  };
}
