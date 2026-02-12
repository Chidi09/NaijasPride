import { ZeptoMailClient } from "../../modules/notifications/zepto.client";

export class EmailService {
  private renderShell(params: { title: string; subtitle?: string; bodyHtml: string; footerNote?: string }) {
    const { title, subtitle, bodyHtml, footerNote } = params;
    return `
      <div style="margin:0;padding:0;background:#0b0708;font-family:'Segoe UI',Arial,sans-serif;color:#f5eadd;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #3f1d28;background:#140d11;border-radius:14px;overflow:hidden;">
                <tr>
                  <td style="padding:22px 24px;background:linear-gradient(135deg,#800020,#5f1327);">
                    <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f4d7b2;">NaijasPride</p>
                    <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3;color:#fff;">${title}</h1>
                    ${subtitle ? `<p style="margin:8px 0 0;font-size:14px;color:#f8e8d3;">${subtitle}</p>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;color:#f7eee7;font-size:15px;line-height:1.7;">
                    ${bodyHtml}
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 24px;border-top:1px solid #3f1d28;font-size:12px;color:#bfa49a;">
                    ${footerNote || 'You are receiving this email because you have an account on NaijasPride.'}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  async sendWelcomeEmail(email: string, name?: string) {
    const customerName = name || 'there';
    const html = this.renderShell({
      title: `Welcome, ${customerName}!`,
      subtitle: 'Your account is live. Start exploring movies, books, comics, and manga.',
      bodyHtml: `
        <p style="margin:0 0 12px;">Thanks for joining NaijasPride. Your account has been created successfully.</p>
        <p style="margin:0 0 12px;">You are currently on the <strong>Free</strong> tier. Premium access is not granted automatically and is only activated after a successful subscription payment.</p>
        <p style="margin:0 0 18px;">You can browse content immediately and upgrade any time from your profile.</p>
        <a href="${process.env.FRONTEND_URL || 'https://naijaspride.pxxl.click'}/login" style="display:inline-block;background:#800020;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px;">Go to NaijasPride</a>
      `,
      footerNote: 'Need help? Contact support@naijaspride.com',
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: "Welcome to NaijasPride",
      from: "noreply@naijaspride.com",
      html,
      text: `Welcome to NaijasPride, ${customerName}.
Your account has been created on the Free tier.
Premium access is not automatic and only starts after successful subscription payment.
Sign in: ${(process.env.FRONTEND_URL || 'https://naijaspride.pxxl.click')}/login`,
    });

    if (sent) {
      console.log(`[Email] Welcome sent to ${email}`);
    }
  }

  async sendReceipt(email: string, amount: string, plan: string) {
    const html = this.renderShell({
      title: 'Payment Received',
      subtitle: 'Your subscription receipt from NaijasPride',
      bodyHtml: `
        <p style="margin:0 0 12px;">We have received your payment successfully.</p>
        <p style="margin:0 0 12px;">
          <strong>Plan:</strong> ${plan}<br/>
          <strong>Amount:</strong> ${amount}
        </p>
        <p style="margin:0;">If you did not authorize this payment, contact support immediately.</p>
      `,
      footerNote: 'Billing support: billing@naijaspride.com',
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: "Payment Receipt",
      from: "billing@naijaspride.com",
      html,
      text: `Payment received on NaijasPride.
Plan: ${plan}
Amount: ${amount}`,
    });

    if (sent) {
      console.log(`[Email] Receipt sent to ${email}`);
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
