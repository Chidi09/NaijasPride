import { ZeptoMailClient } from "../../modules/notifications/zepto.client";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://naijaspride.com";
const NOREPLY    = "noreply@naijaspride.com";
const BILLING    = "billing@naijaspride.com";
const BRAND_NAME = "NaijasPride";

// ─────────────────────────────────────────────────────────────────────────────
// Shared design helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Cinema-dark brand button */
const btn = (href: string, label: string) =>
  `<a href="${href}"
      style="display:inline-block;background:#800020;color:#ffffff;text-decoration:none;
             font-weight:700;font-size:15px;padding:13px 24px;border-radius:8px;
             margin:16px 0;letter-spacing:0.3px;font-family:'Segoe UI',Arial,sans-serif;">
     ${label}
   </a>`;

/** Muted secondary link (no button style) */
const link = (href: string, label: string) =>
  `<a href="${href}" style="color:#c07060;text-decoration:underline;">${label}</a>`;

/** Key–value info row inside the receipt / subscription box */
const infoRow = (key: string, value: string) =>
  `<tr>
     <td style="padding:8px 12px;font-size:14px;color:#bfa49a;white-space:nowrap;">${key}</td>
     <td style="padding:8px 12px;font-size:14px;color:#f7eee7;font-weight:600;">${value}</td>
   </tr>`;

/** Boxed info table (used in receipt + subscription emails) */
const infoTable = (rows: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" width="100%"
          style="border:1px solid #3f1d28;border-radius:8px;background:#0f0a0c;margin:16px 0;">
     <tbody>${rows}</tbody>
   </table>`;

/** Divider line */
const divider = `<hr style="border:none;border-top:1px solid #3f1d28;margin:20px 0;">`;

/**
 * Master layout shell — every email is wrapped in this.
 * Dark cinema theme: near-black page, plum card, burgundy header.
 */
function renderShell(params: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const { title, subtitle, bodyHtml, footerNote } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0b0708;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#f5eadd;-webkit-font-smoothing:antialiased;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background:#0b0708;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:620px;border:1px solid #3f1d28;background:#140d11;
                      border-radius:14px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.6);">

          <!-- Header -->
          <tr>
            <td style="padding:28px 28px 24px;background:linear-gradient(135deg,#800020 0%,#5f1327 100%);">
              <p style="margin:0 0 12px;font-size:11px;letter-spacing:3px;text-transform:uppercase;
                        color:#f4d7b2;font-weight:600;">
                ${BRAND_NAME}
              </p>
              <h1 style="margin:0;font-size:26px;line-height:1.25;color:#ffffff;font-weight:700;
                         letter-spacing:-0.3px;">
                ${title}
              </h1>
              ${subtitle
                ? `<p style="margin:10px 0 0;font-size:14px;color:#f0d5c0;line-height:1.5;">${subtitle}</p>`
                : ""}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 24px;color:#f0e8e0;font-size:15px;line-height:1.75;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px 20px;border-top:1px solid #3f1d28;
                       font-size:12px;color:#8a7470;line-height:1.6;">
              ${footerNote || `You are receiving this because you have a ${BRAND_NAME} account. &nbsp;|&nbsp; ${link(`${FRONTEND_URL}/account`, "Manage preferences")}`}
            </td>
          </tr>

        </table>

        <!-- Bottom brand stamp -->
        <p style="margin:20px 0 0;font-size:11px;color:#4a3a38;letter-spacing:1px;text-transform:uppercase;">
          &copy; ${new Date().getFullYear()} ${BRAND_NAME} &mdash; Stream Nigerian &amp; Worldwide Content
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmailService
// ─────────────────────────────────────────────────────────────────────────────

export class EmailService {

  // ── 1. WELCOME ────────────────────────────────────────────────────────────
  async sendWelcomeEmail(email: string, name?: string) {
    const customerName = name || "there";

    const html = renderShell({
      title: `Welcome, ${customerName}!`,
      subtitle: "Your account is live. Start exploring movies, books, comics, and manga.",
      bodyHtml: `
        <p style="margin:0 0 14px;">
          Thanks for joining <strong>${BRAND_NAME}</strong>. Your account has been created successfully.
        </p>

        <p style="margin:0 0 14px;">
          You&rsquo;re currently on the <strong>Free</strong> tier &mdash;
          you can browse and stream content right away.
          Premium access (4K, no ads, unlimited downloads) is only activated
          after a successful subscription payment.
        </p>

        <p style="margin:0 0 20px;">
          Upgrade any time from your profile page.
        </p>

        ${btn(`${FRONTEND_URL}/browse`, "Start Watching")}

        ${divider}

        <p style="margin:0;font-size:13px;color:#bfa49a;">
          Need help? Reply to this email or visit our
          ${link(`${FRONTEND_URL}/help`, "Help Center")}.
        </p>
      `,
      footerNote: `You received this because you created a ${BRAND_NAME} account. &nbsp;|&nbsp; ${link(`${FRONTEND_URL}/account`, "Account Settings")}`,
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: `Welcome to ${BRAND_NAME}!`,
      from: NOREPLY,
      fromName: BRAND_NAME,
      html,
      text: `Welcome to ${BRAND_NAME}, ${customerName}!

Your account is live on the Free tier.
You can browse and stream content immediately.
Premium access is only activated after a successful payment.

Start watching: ${FRONTEND_URL}/browse

Need help? ${FRONTEND_URL}/help`,
    });

    if (sent) console.log(`[Email] Welcome → ${email}`);
  }

  // ── 2. EMAIL VERIFICATION ─────────────────────────────────────────────────
  async sendVerificationEmail(email: string, verificationToken: string, name?: string) {
    const customerName = name || "there";
    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const html = renderShell({
      title: "Verify Your Email",
      subtitle: "One quick step to secure your account",
      bodyHtml: `
        <p style="margin:0 0 14px;">Hi ${customerName},</p>
        <p style="margin:0 0 14px;">
          Thanks for signing up! Please verify your email address so we know it&rsquo;s really you.
        </p>

        ${btn(verifyUrl, "Verify Email Address")}

        <p style="margin:16px 0 6px;font-size:13px;color:#bfa49a;">
          Or paste this link into your browser:
        </p>
        <p style="margin:0 0 16px;font-size:12px;color:#c07060;word-break:break-all;">
          ${verifyUrl}
        </p>

        ${divider}

        <p style="margin:0;font-size:13px;color:#bfa49a;">
          This link expires in <strong>24 hours</strong>.
          If you didn&rsquo;t create an account, you can safely ignore this email.
        </p>
      `,
      footerNote: `This verification email was sent by ${BRAND_NAME}. &nbsp;|&nbsp; ${link(`${FRONTEND_URL}/help`, "Help")}`,
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: "Verify Your Email Address – NaijasPride",
      from: NOREPLY,
      fromName: BRAND_NAME,
      html,
      text: `Verify Your Email – ${BRAND_NAME}

Hi ${customerName},

Please verify your email address by visiting the link below:
${verifyUrl}

This link expires in 24 hours.

If you didn't create an account, you can safely ignore this email.`,
    });

    if (sent) console.log(`[Email] Verification → ${email}`);
  }

  // ── 3. PASSWORD RESET ─────────────────────────────────────────────────────
  async sendPasswordResetEmail(email: string, resetToken: string, name?: string) {
    const customerName = name || "there";
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    const html = renderShell({
      title: "Reset Your Password",
      subtitle: "We received a password reset request for your account",
      bodyHtml: `
        <p style="margin:0 0 14px;">Hi ${customerName},</p>
        <p style="margin:0 0 14px;">
          Click the button below to choose a new password.
          If you didn&rsquo;t request this, no changes have been made &mdash;
          you can safely ignore this email.
        </p>

        ${btn(resetUrl, "Reset My Password")}

        <p style="margin:16px 0 6px;font-size:13px;color:#bfa49a;">
          Or paste this link into your browser:
        </p>
        <p style="margin:0 0 16px;font-size:12px;color:#c07060;word-break:break-all;">
          ${resetUrl}
        </p>

        ${divider}

        <p style="margin:0;font-size:13px;color:#bfa49a;">
          This link expires in <strong>1 hour</strong> for your security.
          If you&rsquo;re concerned about unauthorised access, ${link(`${FRONTEND_URL}/help`, "contact support")}.
        </p>
      `,
      footerNote: `This email was sent by ${BRAND_NAME} in response to a password reset request.`,
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: "Password Reset Request – NaijasPride",
      from: NOREPLY,
      fromName: BRAND_NAME,
      html,
      text: `Password Reset – ${BRAND_NAME}

Hi ${customerName},

Reset your password using the link below:
${resetUrl}

This link expires in 1 hour.

If you did not request this, please ignore this email.`,
    });

    if (sent) console.log(`[Email] Password reset → ${email}`);
  }

  // ── 4. PASSWORD CHANGED CONFIRMATION ─────────────────────────────────────
  async sendPasswordChangedEmail(email: string, name?: string) {
    const customerName = name || "there";
    const changedAt = new Date().toLocaleString("en-NG", {
      timeZone: "Africa/Lagos",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const html = renderShell({
      title: "Your Password Was Changed",
      subtitle: "Security notification for your NaijasPride account",
      bodyHtml: `
        <p style="margin:0 0 14px;">Hi ${customerName},</p>
        <p style="margin:0 0 14px;">
          Your <strong>${BRAND_NAME}</strong> account password was successfully changed on
          <strong>${changedAt} (WAT)</strong>.
        </p>

        <p style="margin:0 0 20px;padding:14px 16px;background:#1e0f14;border-left:3px solid #800020;
                  border-radius:4px;font-size:14px;color:#f0c8b0;">
          If you made this change, no further action is needed.
          <br><br>
          If you did <strong>not</strong> make this change, your account may be compromised.
          ${link(`${FRONTEND_URL}/forgot-password`, "Reset your password immediately")}
          and contact us at ${link(`${FRONTEND_URL}/help`, "support")}.
        </p>

        ${btn(`${FRONTEND_URL}/account`, "Review Account Settings")}
      `,
      footerNote: `Security notification from ${BRAND_NAME}. You cannot unsubscribe from security emails.`,
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: "Your NaijasPride Password Was Changed",
      from: NOREPLY,
      fromName: `${BRAND_NAME} Security`,
      html,
      text: `Password Changed – ${BRAND_NAME}

Hi ${customerName},

Your NaijasPride password was changed on ${changedAt} (WAT).

If you made this change, no action is needed.

If you did NOT make this change, reset your password immediately:
${FRONTEND_URL}/forgot-password

And contact support: ${FRONTEND_URL}/help`,
    });

    if (sent) console.log(`[Email] Password changed confirmation → ${email}`);
  }

  // ── 5. PAYMENT RECEIPT ────────────────────────────────────────────────────
  async sendReceipt(email: string, amount: string, plan: string) {
    const html = renderShell({
      title: "Payment Received",
      subtitle: "Your NaijasPride subscription is confirmed",
      bodyHtml: `
        <p style="margin:0 0 16px;">
          We&rsquo;ve received your payment and your subscription is now active.
          Thank you for supporting ${BRAND_NAME}!
        </p>

        ${infoTable(
          infoRow("Plan", plan) +
          infoRow("Amount", amount) +
          infoRow("Date", new Date().toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "long" })) +
          infoRow("Status", "&#10003; Paid")
        )}

        <p style="margin:16px 0 20px;font-size:14px;color:#bfa49a;">
          Your PRO benefits are now active: 4K streaming, zero ads, and unlimited downloads.
        </p>

        ${btn(`${FRONTEND_URL}/browse`, "Start Streaming in 4K")}

        ${divider}

        <p style="margin:0;font-size:13px;color:#bfa49a;">
          If you did not authorise this payment, contact billing immediately at
          ${link(`${FRONTEND_URL}/help`, "our support page")}.
        </p>
      `,
      footerNote: `Billing support: ${link(`${FRONTEND_URL}/help`, "Help Centre")} &nbsp;|&nbsp; ${BILLING}`,
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: `Payment Confirmed – ${plan} – NaijasPride`,
      from: BILLING,
      fromName: `${BRAND_NAME} Billing`,
      html,
      text: `Payment Confirmed – ${BRAND_NAME}

Plan:   ${plan}
Amount: ${amount}
Date:   ${new Date().toLocaleDateString("en-NG")}
Status: Paid

Your PRO benefits are now active.

Start watching: ${FRONTEND_URL}/browse

Billing support: ${FRONTEND_URL}/help`,
    });

    if (sent) console.log(`[Email] Receipt → ${email}`);
  }

  // ── 6. SUBSCRIPTION ACTIVATED ────────────────────────────────────────────
  async sendSubscriptionActivatedEmail(
    email: string,
    name: string | undefined,
    plan: string,
    amount: string,
    nextBillingDate: Date
  ) {
    const customerName = name || "there";
    const expiryStr = nextBillingDate.toLocaleDateString("en-NG", {
      timeZone: "Africa/Lagos",
      dateStyle: "long",
    });

    const html = renderShell({
      title: "Welcome to PRO!",
      subtitle: `Your ${plan} subscription is now live`,
      bodyHtml: `
        <p style="margin:0 0 14px;">Hi ${customerName},</p>
        <p style="margin:0 0 16px;">
          Your <strong>${BRAND_NAME} PRO</strong> subscription is active.
          Here&rsquo;s a summary of what you unlocked:
        </p>

        <!-- Perks grid -->
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%"
               style="border:1px solid #3f1d28;border-radius:8px;background:#0f0a0c;margin:0 0 20px;">
          <tbody>
            <tr>
              <td style="padding:12px 16px;font-size:14px;color:#f0e8e0;">
                <strong style="color:#f4d7b2;">&#127917; 4K Ultra HD</strong><br>
                <span style="color:#bfa49a;font-size:13px;">Stream in the highest quality available</span>
              </td>
            </tr>
            <tr style="border-top:1px solid #3f1d28;">
              <td style="padding:12px 16px;font-size:14px;color:#f0e8e0;">
                <strong style="color:#f4d7b2;">&#128683; Zero Ads</strong><br>
                <span style="color:#bfa49a;font-size:13px;">Uninterrupted streaming, no pre-roll ads</span>
              </td>
            </tr>
            <tr style="border-top:1px solid #3f1d28;">
              <td style="padding:12px 16px;font-size:14px;color:#f0e8e0;">
                <strong style="color:#f4d7b2;">&#11015; Unlimited Downloads</strong><br>
                <span style="color:#bfa49a;font-size:13px;">Download movies, books, and comics</span>
              </td>
            </tr>
            <tr style="border-top:1px solid #3f1d28;">
              <td style="padding:12px 16px;font-size:14px;color:#f0e8e0;">
                <strong style="color:#f4d7b2;">&#128218; Full Library Access</strong><br>
                <span style="color:#bfa49a;font-size:13px;">Movies, Nollywood, Bollywood, Books, Manga, Comics</span>
              </td>
            </tr>
          </tbody>
        </table>

        ${infoTable(
          infoRow("Plan", plan) +
          infoRow("Amount Paid", amount) +
          infoRow("Next Renewal", expiryStr)
        )}

        ${btn(`${FRONTEND_URL}/browse`, "Start Streaming Now")}

        ${divider}

        <p style="margin:0;font-size:13px;color:#bfa49a;">
          Manage or cancel your subscription any time from your
          ${link(`${FRONTEND_URL}/profile`, "Profile page")}.
        </p>
      `,
      footerNote: `Billing support: ${link(`${FRONTEND_URL}/help`, "Help Centre")} &nbsp;|&nbsp; ${BILLING}`,
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: `You're now on PRO – ${BRAND_NAME}`,
      from: BILLING,
      fromName: `${BRAND_NAME} Billing`,
      html,
      text: `Welcome to PRO – ${BRAND_NAME}

Hi ${customerName},

Your ${plan} subscription is now active.

What you unlocked:
- 4K Ultra HD streaming
- Zero ads
- Unlimited downloads
- Full library: movies, books, manga, comics

Plan:         ${plan}
Amount Paid:  ${amount}
Next Renewal: ${expiryStr}

Start streaming: ${FRONTEND_URL}/browse

Manage subscription: ${FRONTEND_URL}/profile`,
    });

    if (sent) console.log(`[Email] Subscription activated → ${email}`);
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
    const customerName = name || "there";
    const movieUrl = `${FRONTEND_URL}/movies/${movieSlug}`;

    const html = renderShell({
      title: "Your Movie is Ready!",
      subtitle: `${movieTitle} is now available in ${quality}`,
      bodyHtml: `
        <p style="margin:0 0 14px;">Hi ${customerName},</p>
        <p style="margin:0 0 16px;">
          Great news! <strong>${movieTitle}</strong> is now available in
          <strong>${quality}</strong> on ${BRAND_NAME}.
          You asked to be notified &mdash; here you go!
        </p>

        ${thumbnailUrl
          ? `<img src="${thumbnailUrl}" alt="${movieTitle}" width="280"
                  style="border-radius:8px;border:1px solid #3f1d28;margin:0 0 20px;display:block;max-width:100%;">`
          : ""}

        ${btn(movieUrl, `Watch ${movieTitle}`)}

        ${divider}

        <p style="margin:0;font-size:13px;color:#bfa49a;">
          You&rsquo;re receiving this because you requested a notification for this title.
          ${link(movieUrl, "Manage notifications")} on the movie page.
        </p>
      `,
      footerNote: `${BRAND_NAME} content notification &nbsp;|&nbsp; ${link(`${FRONTEND_URL}/browse`, "Browse all movies")}`,
    });

    const sent = await ZeptoMailClient.send({
      to: email,
      subject: `Now Available: ${movieTitle} (${quality}) – ${BRAND_NAME}`,
      from: NOREPLY,
      fromName: BRAND_NAME,
      html,
      text: `Now Available – ${BRAND_NAME}

Hi ${customerName},

${movieTitle} is now available in ${quality}!

Watch it now: ${movieUrl}

You asked to be notified when this title became available.`,
    });

    if (sent) console.log(`[Email] Movie available (${movieTitle}) → ${email}`);
  }
}

// Singleton instance
export const emailService = new EmailService();
