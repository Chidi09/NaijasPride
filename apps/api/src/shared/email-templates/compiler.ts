import mjml2html from "mjml";
import Handlebars from "handlebars";
import { readFileSync } from "fs";
import { join } from "path";

const TEMPLATES_DIR = join(__dirname, "..", "email-templates");

interface MJMLResult {
  html: string;
  errors: Array<{
    message: string;
    line?: number;
    tagName?: string;
    formattedMessage?: string;
  }>;
}

/**
 * Compile an MJML template with Handlebars variables
 */
export function compileTemplate(
  templateName: string,
  variables: Record<string, unknown>,
): { html: string; text: string } {
  try {
    // Read MJML template
    const mjmlPath = join(TEMPLATES_DIR, `${templateName}.mjml`);
    const mjmlContent = readFileSync(mjmlPath, "utf-8");

    // Compile Handlebars variables
    const template = Handlebars.compile(mjmlContent);
    const mjmlWithVars = template({
      ...variables,
      year: new Date().getFullYear(),
    });

    // Compile MJML to HTML
    const result = mjml2html(mjmlWithVars, {
      validationLevel: "soft",
      minify: true,
    });

    if (result.errors.length > 0) {
      console.warn(`[MJML] Warnings for ${templateName}:`, result.errors);
    }

    // Generate plain text version
    const text = htmlToText(result.html);

    return {
      html: result.html,
      text,
    };
  } catch (error) {
    console.error(`[MJML] Failed to compile ${templateName}:`, error);
    throw error;
  }
}

/**
 * Convert HTML to plain text
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[<>]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[<>]*?<\/script>/gi, "")
    .replace(/<[^\u003e]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}
