export type UnknownRecord = Record<string, unknown>;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function apiErrorMessage(payload: unknown, status: number) {
  const body = asRecord(payload);
  const error = asRecord(body?.error);
  const explicit =
    asString(error?.message) ??
    asString(body?.message) ??
    (typeof body?.error === "string" ? body.error : null);
  if (explicit) return explicit;

  if (status === 401) return "Tu sesión expiró. Ingresa de nuevo.";
  if (status === 403)
    return "Esta actividad no está disponible para tu cuenta en este momento.";
  if (status === 409)
    return "La operación cambió de estado. Actualiza antes de continuar.";
  if (status === 422)
    return "El servidor rechazó la actividad porque no superó la validación.";
  if (status === 429)
    return "Alcanzaste un límite temporal. Espera antes de reintentar.";
  return "El servicio no respondió como esperábamos. Inténtalo de nuevo.";
}

export function apiRequestError(payload: unknown, status: number) {
  const body = asRecord(payload);
  const error = asRecord(body?.error);
  const code = asString(error?.code) ?? asString(body?.code);
  return new ApiRequestError(apiErrorMessage(payload, status), status, code);
}

export function canDiscardGameState(caught: unknown) {
  if (!(caught instanceof ApiRequestError)) return false;
  if ([403, 404, 410].includes(caught.status)) return true;
  return new Set([
    "GAME_SESSION_NOT_FOUND",
    "GAME_SESSION_TOKEN_INVALID",
    "GAME_CONTEXT_MISMATCH",
    "GAME_SESSION_EXPIRED",
  ]).has(caught.code ?? "");
}

export function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function errorMessage(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "Ocurrió un error inesperado. Inténtalo de nuevo.";
}
