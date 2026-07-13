export interface WelcomeBonusIssuer {
  issue(userId: string): Promise<{ transactionId: string }>;
}
