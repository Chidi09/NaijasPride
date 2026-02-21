import axios from "axios";
import nodemailer from "nodemailer";

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
  
  // SMTP Configuration
  private static readonly SMTP_HOST = process.env.SMTP_HOST || "smtp.zeptomail.com";
  private static readonly SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
  private static readonly SMTP_USER = process.env.SMTP_USER || "emailapikey";
  private static readonly SMTP_PASS = process.env.SMTP_PASS || "";
  private static readonly SMTP_SECURE = process.env.SMTP_SECURE === "true";
  private static readonly SMTP_FROM = process.env.SMTP_FROM || "noreply@naijaspride.com";

  private static getSMTPTransporter() {
    if (!this.SMTP_PASS) {
      return null;
    }
    
    return nodemailer.createTransport({
      host: this.SMTP_HOST,
      port: this.SMTP_PORT,
      secure: this.SMTP_SECURE, // true for 465, false for 587
      auth: {
        user: this.SMTP_USER,
        pass: this.SMTP_PASS,
      },
      tls: {
        minVersion: "TLSv1.2",
      },
    });
  }

  static async send(payload: EmailPayload): Promise<boolean> {
    // Try SMTP first (more reliable with ZeptoMail)
    const smtpResult = await this.sendViaSMTP(payload);
    if (smtpResult) {
      return true;
    }
    
    // Fallback to REST API
    return this.sendViaAPI(payload);
  }

  private static async sendViaSMTP(payload: EmailPayload): Promise<boolean> {
    const transporter = this.getSMTPTransporter();
    if (!transporter) {
      console.log("⚠️ SMTP not configured, skipping SMTP attempt");
      return false;
    }

    try {
      const toAddresses = Array.isArray(payload.to) ? payload.to : [payload.to];
      
      await transporter.sendMail({
        from: {
          name: payload.fromName || "NaijasPride",
          address: payload.from || this.SMTP_FROM,
        },
        to: toAddresses.map(email => ({ address: email })),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      console.log(`✉️ Email sent via SMTP to: ${toAddresses.join(", ")}`);
      return true;
    } catch (error: any) {
      console.error("SMTP send failed:", error.message);
      return false;
    }
  }

  private static async sendViaAPI(payload: EmailPayload): Promise<boolean> {
    if (!this.API_KEY) {
      console.warn("⚠️ ZEPTOMAIL_API_KEY not set. Email not sent.");
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
            address: payload.from || this.SMTP_FROM,
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
      console.error("Failed to send email via API:", error.message);
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
