import nodemailer, { type Transporter } from "nodemailer";
import type {
  TransactionalMailer,
  TokenOwner,
} from "../domain/account-security.js";

export class SmtpMailer implements TransactionalMailer {
  private transport?: Transporter;
  constructor(
    private readonly options: {
      host: string;
      port: number;
      from: string;
      appBaseUrl: string;
    },
  ) {}
  async sendEmailVerification(to: TokenOwner, token: string) {
    const link = `${this.options.appBaseUrl}/app/verify?token=${encodeURIComponent(token)}`;
    await this.getTransport().sendMail({
      from: this.options.from,
      to: to.email,
      subject: "Verifica tu cuenta Fauzet",
      text: `Hola ${to.displayName ?? ""}. Verifica tu cuenta: ${link}`,
      html: this.template(
        "Verifica tu cuenta",
        "Confirma tu email para activar las funciones de Fauzet.",
        link,
        "Verificar email",
      ),
    });
  }
  async sendPasswordReset(to: TokenOwner, token: string) {
    const link = `${this.options.appBaseUrl}/app/reset?token=${encodeURIComponent(token)}`;
    await this.getTransport().sendMail({
      from: this.options.from,
      to: to.email,
      subject: "Restablece tu contraseña Fauzet",
      text: `Restablece tu contraseña: ${link}`,
      html: this.template(
        "Restablece tu contraseña",
        "Este enlace expira en una hora. Si no lo solicitaste, ignóralo.",
        link,
        "Cambiar contraseña",
      ),
    });
  }
  private getTransport() {
    this.transport ??= nodemailer.createTransport({
      host: this.options.host,
      port: this.options.port,
      secure: false,
    });
    return this.transport;
  }
  private template(title: string, copy: string, link: string, cta: string) {
    return `<!doctype html><html><body style="margin:0;background:#080b12;color:#e5e7eb;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;padding:40px 24px"><div style="font-size:24px;font-weight:800">Fau<span style="color:#39ff88">zet</span></div><h1 style="font-size:30px;margin:30px 0 12px">${title}</h1><p style="color:#9ca3af;line-height:1.6">${copy}</p><a href="${link}" style="display:inline-block;margin-top:20px;background:#39ff88;color:#04140a;padding:13px 20px;border-radius:10px;font-weight:800;text-decoration:none">${cta}</a><p style="color:#6b7280;font-size:11px;margin-top:32px">ZYXE es una unidad interna de utilidad y no representa una inversión.</p></div></body></html>`;
  }
}
