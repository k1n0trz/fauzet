import type {
  TransactionalMailer,
  TokenOwner,
} from "../domain/account-security.js";
export class MemoryMailer implements TransactionalMailer {
  readonly verification: { to: TokenOwner; token: string }[] = [];
  readonly resets: { to: TokenOwner; token: string }[] = [];
  readonly withdrawalCodes: { to: TokenOwner; code: string }[] = [];
  async sendEmailVerification(to: TokenOwner, token: string) {
    this.verification.push({ to, token });
  }
  async sendPasswordReset(to: TokenOwner, token: string) {
    this.resets.push({ to, token });
  }
  async sendWithdrawalCode(to: TokenOwner, code: string) {
    this.withdrawalCodes.push({ to, code });
  }
}
