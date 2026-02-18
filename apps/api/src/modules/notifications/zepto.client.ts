import axios from "axios";

interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;       // sender email address
  fromName?: string;   // sender display name
}

export class ZeptoMailClient {
  private static readonly API_KEY = process.env.ZEPTOMAIL_API_KEY || "";
  private static readonly BASE_URL = "https://api.zeptomail.com/v1.1/email";

  static async send(payload: EmailPayload): Promise<boolean> {
    if (!this.API_KEY) {
      console.warn("⚠️  ZEPTOMAIL_API_KEY not set. Email not sent.");
      console.log("Email would have been sent:", {
        to: payload.to,
        subject: payload.subject,
      });
      return false;
    }

    try {
      const response = await axios.post(
        this.BASE_URL,
        {
          from: {
            address: payload.from || "noreply@naijaspride.com",
            name: payload.fromName || "NaijasPride",
          },
          to: Array.isArray(payload.to)
            ? payload.to.map((email) => ({ email_address: { address: email } }))
            : [{ email_address: { address: payload.to } }],
          subject: payload.subject,
          htmlbody: payload.html,
          textbody: payload.text,
        },
        {
          headers: {
            Authorization: this.API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      return response.status === 200 || response.status === 201;
    } catch (error: any) {
      console.error("Failed to send email:", error.message);
      if (error.response) {
        console.error("ZeptoMail response:", error.response.data);
      }
      return false;
    }
  }

  // Bulk email sending with rate limiting
  static async sendBulk(
    payloads: EmailPayload[],
    delayMs: number = 100
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const payload of payloads) {
      const result = await this.send(payload);
      if (result) success++;
      else failed++;

      // Rate limiting
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { success, failed };
  }
}
