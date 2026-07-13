import type {
  AccountActivityQuery,
  AccountActivityResponse,
} from "@fauzet/contracts";

export interface AccountActivityStore {
  list(
    userId: string,
    query: AccountActivityQuery,
  ): Promise<AccountActivityResponse>;
}

export class AccountActivityService {
  constructor(private readonly store: AccountActivityStore) {}

  list(userId: string, query: AccountActivityQuery) {
    return this.store.list(userId, query);
  }
}
