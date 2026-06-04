/**
 * Transactional email via AWS SES (invites / notifications).
 *
 * This is a thin stub: it sends if SES env is present, otherwise it logs and
 * resolves (so dev / build never fails on missing email config). Wire real
 * templates in Phase 4.
 */
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const region = process.env.AWS_REGION;
  const from = process.env.SES_FROM_EMAIL;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !from || !accessKeyId || !secretAccessKey) {
    // Stub mode — no email backend configured.
    console.warn("[email] SES not configured; skipping send", {
      to: input.to,
      subject: input.subject,
    });
    return;
  }

  const client = new SESClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const toAddresses = Array.isArray(input.to) ? input.to : [input.to];

  await client.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: toAddresses },
      Message: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: input.text, Charset: "UTF-8" },
          ...(input.html
            ? { Html: { Data: input.html, Charset: "UTF-8" } }
            : {}),
        },
      },
    }),
  );
}
