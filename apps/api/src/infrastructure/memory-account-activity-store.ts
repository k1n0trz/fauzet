import type { AccountActivityStore } from "../domain/account-activity.js";

export class MemoryAccountActivityStore implements AccountActivityStore {
  async list() {
    return { items: [], nextCursor: null };
  }
}
