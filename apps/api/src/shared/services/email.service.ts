import nodemailer from 'nodemailer';

export class EmailService {
  private transporter;

  constructor() {
    // For Production: Use SendGrid / AWS SES / Resend credentials
    // For Dev: We can use a mock or Gmail (if configured)
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendWelcomeEmail(email: string, name?: string) {
    await this.transporter.sendMail({
      from: '"NaijasPride" <noreply@naijaspride.com>',
      to: email,
      subject: 'Welcome to the Club 🎬',
      html: `
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; background: #121212; color: #F5F5DC; padding: 40px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="font-family: 'Cinzel', serif; color: #800020; font-size: 48px; margin: 0;">N</h1>
            <p style="letter-spacing: 4px; font-size: 12px; margin: 5px 0;">NAIJAS PRIDE</p>
          </div>
          
          <h2 style="font-family: 'Cinzel', serif; color: #ffffff; margin-bottom: 20px;">Welcome, ${name || 'Movie Lover'}!</h2>
          
          <p style="line-height: 1.6; margin-bottom: 20px;">
            You've successfully joined NaijasPride. Get ready for the best of Nollywood and beyond. 
            Experience cinema like never before with our curated collection of masterpieces.
          </p>
          
          <div style="background: #1e1e1e; padding: 20px; border-radius: 4px; margin: 30px 0; text-align: center;">
            <p style="margin: 0 0 15px 0; color: #800020; font-weight: bold;">What's waiting for you:</p>
            <ul style="list-style: none; padding: 0; margin: 0; text-align: left; display: inline-block;">
              <li style="margin: 10px 0;">🎬 4K Ultra HD Quality</li>
              <li style="margin: 10px 0;">⚡ Fast Downloads</li>
              <li style="margin: 10px 0;">🎭 Curated Nollywood Collection</li>
              <li style="margin: 10px 0;">🔒 Secure & Private</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://naijaspride.com" style="background: #800020; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold; letter-spacing: 1px;">
              START WATCHING
            </a>
          </div>
          
          <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #666;">
            © 2026 NaijasPride. Made with ❤️ in Lagos.
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
      subject: 'Payment Receipt 🧾',
      html: `
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; background: #121212; color: #F5F5DC; padding: 40px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="font-family: 'Cinzel', serif; color: #800020; font-size: 48px; margin: 0;">N</h1>
            <p style="letter-spacing: 4px; font-size: 12px; margin: 5px 0;">NAIJAS PRIDE</p>
          </div>
          
          <h2 style="font-family: 'Cinzel', serif; color: #ffffff; margin-bottom: 20px;">Payment Received</h2>
          
          <p style="line-height: 1.6; margin-bottom: 30px;">
            Thank you for your payment. You are now a Premium member of NaijasPride!
          </p>
          
          <div style="background: #1e1e1e; padding: 25px; border-radius: 4px; margin: 30px 0;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 15px; margin-bottom: 15px;">
              <span style="color: #888;">Plan</span>
              <span style="font-weight: bold; color: #ffffff;">${plan}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 15px; margin-bottom: 15px;">
              <span style="color: #888;">Amount Paid</span>
              <span style="font-weight: bold; color: #800020;">${amount}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #888;">Status</span>
              <span style="font-weight: bold; color: #4ade80;">✓ Confirmed</span>
            </div>
          </div>
          
          <div style="background: #800020; padding: 20px; border-radius: 4px; margin: 30px 0; text-align: center;">
            <p style="margin: 0; font-weight: bold; color: #ffffff;">Enjoy unlimited 4K downloads</p>
          </div>
          
          <p style="line-height: 1.6; margin-top: 30px;">
            If you have any questions about your subscription, please contact our support team.
          </p>
          
          <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #666;">
            © 2026 NaijasPride. Made with ❤️ in Lagos.
          </p>
        </div>
      `,
    });
    console.log(`[Email] Receipt sent to ${email}`);
  }
}

// Singleton instance
export const emailService = new EmailService();
