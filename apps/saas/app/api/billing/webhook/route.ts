import Stripe from "stripe";
import { json, ApiError } from "@/lib/api";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/webhook — Stripe webhook skeleton (Phase 5 stub).
 *
 * Verifies the signature, switches on subscription/invoice events, and updates
 * workspaces.plan accordingly. Full Checkout / Customer Portal wiring is left
 * for Phase 5; this establishes the secure entry point and the plan-sync path.
 *
 * NOTE: not wrapped in withApi because Stripe needs the raw body for signature
 * verification (NextRequest.text()).
 */
export async function POST(req: Request): Promise<Response> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    throw new ApiError(500, "Stripe is not configured");
  }

  const stripe = new Stripe(secretKey);
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "signature verification failed";
    return json({ error: `Webhook Error: ${msg}` }, 400);
  }

  const supabase = getServiceSupabase();

  // Map Stripe price/product to our plan tier. In production this lookup would
  // use price IDs; here we read plan from subscription metadata as a stub.
  async function setPlanForCustomer(customerId: string, plan: string) {
    await supabase
      .from("workspaces")
      .update({ plan })
      .eq("stripe_customer_id", customerId);
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const plan =
        (sub.metadata?.plan as string | undefined) ??
        (sub.status === "active" || sub.status === "trialing" ? "team" : "free");
      await setPlanForCustomer(sub.customer as string, plan);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await setPlanForCustomer(sub.customer as string, "free");
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.customer) {
        await setPlanForCustomer(invoice.customer as string, "free");
      }
      break;
    }
    default:
      // Unhandled event types are acknowledged (200) so Stripe stops retrying.
      break;
  }

  return json({ received: true });
}
