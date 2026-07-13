import { beforeEach, describe, expect, it, vi } from "vitest";

const mailerMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(async () => ({ messageId: "test-message" })),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (...args: unknown[]) => {
      mailerMocks.createTransport(...args);
      return { sendMail: mailerMocks.sendMail };
    },
  },
}));

import { SmtpMailer } from "./smtp-mailer.js";

describe("SmtpMailer", () => {
  beforeEach(() => {
    mailerMocks.createTransport.mockClear();
    mailerMocks.sendMail.mockClear();
  });

  it("passes authentication and enforced STARTTLS to nodemailer", async () => {
    const mailer = new SmtpMailer({
      host: "smtp.example.com",
      port: 587,
      from: "Fauzet <no-reply@example.com>",
      appBaseUrl: "https://fauzet.example",
      secure: false,
      requireTls: true,
      auth: { user: "mailer", pass: "secret" },
    });

    await mailer.sendEmailVerification(
      {
        id: "user-1",
        email: "user@example.com",
        displayName: "User",
        status: "ACTIVE",
      },
      "verification-token",
    );

    expect(mailerMocks.createTransport).toHaveBeenCalledOnce();
    expect(mailerMocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "mailer", pass: "secret" },
      tls: { minVersion: "TLSv1.2" },
    });
    expect(mailerMocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Fauzet <no-reply@example.com>",
        to: "user@example.com",
      }),
    );
  });
});
