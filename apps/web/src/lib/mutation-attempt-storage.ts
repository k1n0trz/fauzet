function storageKey(scope: string, signature: string) {
  return `fz_mutation_${encodeURIComponent(`${scope}:${signature}`)}`;
}

export function getOrCreateMutationKey(scope: string, signature: string) {
  const key = storageKey(scope, signature);
  const current = sessionStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

export function clearMutationKey(scope: string, signature: string) {
  sessionStorage.removeItem(storageKey(scope, signature));
}
