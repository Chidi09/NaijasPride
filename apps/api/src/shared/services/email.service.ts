type MailOptions = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

type MailTransport = {
  sendMail: (options: MailOptions) => Promise<unknown>;
};

type NodemailerLike = {
  createTransport: (options: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user?: string;
      pass?: string;
    };
  }) => MailTransport;
};

const createFallbackTransport = (): MailTransport => ({
  sendMail: async (options) => {
    console.warn(
      `[Email] nodemailer unavailable; skipped email to ${options.to} (${options.subject})`,
    );
  },
});

const loadTransport = (): MailTransport => {
  try {
    const req = eval("require") as NodeRequire;
    const nodemailer = req("nodemailer") as NodemailerLike;
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.ethereal.email",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch (error) {
    console.warn("[Email] nodemailer not configured. Using fallback transport.");
    return createFallbackTransport();
  }
};

export class EmailService {
  private transporter: MailTransport;

  constructor() {
    this.transporter = loadTransport();
  }

  async sendWelcomeEmail(email: string, name?: string) {
    await this.transporter.sendMail({
      from: '"NaijasPride" <noreply@naijaspride.com>',
      to: email,
      subject: "Welcome to NaijasPride",
      html: `
        <div style="font-family: Arial, sans-serif; background: #121212; color: #F5F5DC; padding: 40px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ffffff; margin-bottom: 20px;">Welcome, ${name || "Movie Lover"}!</h2>
          <p style="line-height: 1.6; margin-bottom: 20px;">
            You have successfully joined NaijasPride. Enjoy the best of Nollywood and beyond.
          </p>
        </div>
      `,
    });
    console.log(`[Email] Welcome sent to ${email}`);
  }

  async sendReceipt(email: string, amount: string, plan: string) {
    await this.transporter.sendMail({
      from: '"NaijasPride" <billing@naijaspride.com>',
      to: email,
      subject: "Payment Receipt",
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
    console.log(`[Email] Receipt sent to ${email}`);
  }
}

// Singleton instance
export const emailService = new EmailService();
