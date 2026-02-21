import { ZeptoMailClient } from "../../modules/notifications/zepto.client";
import { compileTemplate } from "../email-templates/compiler";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://naijaspride.com";
const NOREPLY = "noreply@naijaspride.com";
const BILLING = "billing@naijaspride.com";

export class EmailService {

  // ── 1. WELCOME ────────────────────────────────────────────────────────────
  async sendWelcomeEmail(email: string, name?: string) {
    try {
      const { html, text } = compileTemplate("welcome", {
        name: name || "there",
        frontendUrl: FRONTEND_URL,
      });

      const sent = await ZeptoMailClient.send({
        to: email,
        subject: "Welcome to NAIJASPRIDE!",
        from: NOREPLY,
        fromName: "NAIJASPRIDE",
        html,
        text,
      });

      if (sent) console.log(`[Email] Welcome → ${email}`);
    } catch (error) {
      console.error(`[Email] Welcome failed → ${email}:`, error);
    }
  }

  // ── 2. EMAIL VERIFICATION ─────────────────────────────────────────────────
  async sendVerificationEmail(email: string, verificationToken: string, name?: string) {
    try {
      const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
      
      const { html, text } = compileTemplate("verification", {
        name: name || "there",
        verifyUrl,
        frontendUrl: FRONTEND_URL,
      });

      const sent = await ZeptoMailClient.send({
        to: email,
        subject: "Verify Your Email Address – NAIJASPRIDE",
        from: NOREPLY,
        fromName: "NAIJASPRIDE",
        html,
        text,
      });

      if (sent) console.log(`[Email] Verification → ${email}`);
    } catch (error) {
      console.error(`[Email] Verification failed → ${email}:`, error);
    }
  }

  // ── 3. PASSWORD RESET ─────────────────────────────────────────────────────
  async sendPasswordResetEmail(email: string, resetToken: string, name?: string) {
    try {
      const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
      
      const { html, text } = compileTemplate("password-reset", {
        name: name || "there",
        resetUrl,
        frontendUrl: FRONTEND_URL,
      });

      const sent = await ZeptoMailClient.send({
        to: email,
        subject: "Password Reset Request – NAIJASPRIDE",
        from: NOREPLY,
        fromName: "NAIJASPRIDE",
        html,
        text,
      });

      if (sent) console.log(`[Email] Password reset → ${email}`);
    } catch (error) {
      console.error(`[Email] Password reset failed → ${email}:`, error);
    }
  }

  // ── 4. PASSWORD CHANGED CONFIRMATION ─────────────────────────────────────
  async sendPasswordChangedEmail(email: string, name?: string) {
    try {
      const changedAt = new Date().toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "medium",
        timeStyle: "short",
      });

      const { html, text } = compileTemplate("password-changed", {
        name: name || "there",
        changedAt,
        frontendUrl: FRONTEND_URL,
      });

      const sent = await ZeptoMailClient.send({
        to: email,
        subject: "Your NAIJASPRIDE Password Was Changed",
        from: NOREPLY,
        fromName: "NAIJASPRIDE Security",
        html,
        text,
      });

      if (sent) console.log(`[Email] Password changed confirmation → ${email}`);
    } catch (error) {
      console.error(`[Email] Password changed failed → ${email}:`, error);
    }
  }

  // ── 5. PAYMENT RECEIPT ────────────────────────────────────────────────────
  async sendReceipt(email: string, amount: string, plan: string) {
    try {
      const date = new Date().toLocaleDateString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "long",
      });

      const { html, text } = compileTemplate("receipt", {
        plan,
        amount,
        date,
        frontendUrl: FRONTEND_URL,
      });

      const sent = await ZeptoMailClient.send({
        to: email,
        subject: `Payment Confirmed – ${plan} – NAIJASPRIDE`,
        from: BILLING,
        fromName: "NAIJASPRIDE Billing",
        html,
        text,
      });

      if (sent) console.log(`[Email] Receipt → ${email}`);
    } catch (error) {
      console.error(`[Email] Receipt failed → ${email}:`, error);
    }
  }

  // ── 6. SUBSCRIPTION ACTIVATED ────────────────────────────────────────────
  async sendSubscriptionActivatedEmail(
    email: string,
    name: string | undefined,
    plan: string,
    amount: string,
    nextBillingDate: Date
  ) {
    try {
      const nextRenewal = nextBillingDate.toLocaleDateString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "long",
      });

      const { html, text } = compileTemplate("subscription-activated", {
        name: name || "there",
        plan,
        amount,
        nextRenewal,
        frontendUrl: FRONTEND_URL,
      });

      const sent = await ZeptoMailClient.send({
        to: email,
        subject: `You're now on PRO – NAIJASPRIDE`,
        from: BILLING,
        fromName: "NAIJASPRIDE Billing",
        html,
        text,
      });

      if (sent) console.log(`[Email] Subscription activated → ${email}`);
    } catch (error) {
      console.error(`[Email] Subscription activated failed → ${email}:`, error);
    }
  }

  // ── 7. MOVIE NOW AVAILABLE ────────────────────────────────────────────────
  async sendMovieAvailableEmail(
    email: string,
    name: string | undefined,
    movieTitle: string,
    movieSlug: string,
    quality: string,
    thumbnailUrl?: string
  ) {
    try {
      const movieUrl = `${FRONTEND_URL}/movies/${movieSlug}`;

      const { html, text } = compileTemplate("movie-available", {
        name: name || "there",
        movieTitle,
        quality,
        thumbnailUrl,
        movieUrl,
        frontendUrl: FRONTEND_URL,
      });

      const sent = await ZeptoMailClient.send({
        to: email,
        subject: `Now Available: ${movieTitle} (${quality}) – NAIJASPRIDE`,
        from: NOREPLY,
        fromName: "NAIJASPRIDE",
        html,
        text,
      });

      if (sent) console.log(`[Email] Movie available (${movieTitle}) → ${email}`);
    } catch (error) {
      console.error(`[Email] Movie available failed → ${email}:`, error);
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
