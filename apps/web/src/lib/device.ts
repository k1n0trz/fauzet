export function getDeviceId() {
  const key = "fz_device_id";
  const current = localStorage.getItem(key);
  if (current) return current;

  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}
