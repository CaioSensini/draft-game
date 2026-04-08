import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('GMAIL_USER'),
        pass: this.configService.get<string>('GMAIL_APP_PASSWORD'),
      },
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const mailOptions = {
      from: `"Codeforje VIO - Draft Game" <${this.configService.get('GMAIL_USER')}>`,
      to,
      subject: 'Draft Game - Codigo de Verificacao',
      html: `
        <div style="font-family: Arial; max-width: 420px; margin: 0 auto; padding: 24px; background: #0f1117; color: #cfd7ea; border-radius: 8px; border: 1px solid #39435c;">
          <div style="text-align: center; margin-bottom: 16px;">
            <h2 style="color: #f8e7b9; margin: 0;">DRAFT GAME</h2>
            <p style="color: #64748b; font-size: 12px; margin: 4px 0 0 0;">by Codeforje VIO</p>
          </div>
          <hr style="border-color: #39435c; margin: 16px 0;" />
          <p style="text-align: center; margin-bottom: 8px;">Seu codigo de verificacao:</p>
          <div style="text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #4ade80; padding: 20px; background: #171b26; border-radius: 6px; margin: 16px 0; border: 1px solid #1e3a5f;">
            ${code}
          </div>
          <p style="text-align: center; font-size: 13px; color: #8ea0c9;">Este codigo expira em <strong>10 minutos</strong>.</p>
          <hr style="border-color: #39435c; margin: 16px 0;" />
          <p style="text-align: center; font-size: 11px; color: #475569;">
            Se voce nao solicitou este codigo, ignore este email.<br/>
            &copy; ${new Date().getFullYear()} Codeforje VIO. Todos os direitos reservados.
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send email:', error);
      // Don't throw - log the code to console as fallback for development
      console.log(`[EMAIL FALLBACK] Verification code for ${to}: ${code}`);
    }
  }
}
