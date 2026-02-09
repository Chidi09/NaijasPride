import { ZeptoMailClient } from "../../modules/notifications/zepto.client";

export class EmailService {
  async sendWelcomeEmail(email: string, name?: string) {
    const sent = await ZeptoMailClient.send({
      to: email,
      subject: "Welcome to NaijasPride",
      from: "noreply@naijaspride.com",
      html: `
        <div style="font-family: Arial, sans-serif; background: #121212; color: #F5F5DC; padding: 40px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ffffff; margin-bottom: 20px;">Welcome, ${name || "Movie Lover"}!</h2>
          <p style="line-height: 1.6; margin-bottom: 20px;">
            You have successfully joined NaijasPride. Enjoy the best of Nollywood and beyond.
          </p>
        </div>
      `,
    });

    if (sent) {
      console.log(`[Email] Welcome sent to ${email}`);
    }
  }

  async sendReceipt(email: string, amount: string, plan: string) {
    const sent = await ZeptoMailClient.send({
      to: email,
      subject: "Payment Receipt",
      from: "billing@naijaspride.com",
      html: `
        <div style="font-family: Arial, sans-serif; background: #121212; color: #F5F5DC; padding: 40px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ffffff; margin-bottom: 20px;">Payment Received</h2>
          <p style="line-height: 1.6;">
            Plan: <strong>${plan}</strong><br/>
            Amount Paid: <strong>${amount}</strong>
          </p>
        </div>
      `,
    });

    if (sent) {
      console.log(`[Email] Receipt sent to ${email}`);
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
