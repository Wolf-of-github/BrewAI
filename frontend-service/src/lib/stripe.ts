// ─── Stripe service stub ───────────────────────────────────────────────────────
// Replace the bodies of these functions with real Stripe API calls when ready.
// All functions are async so callers don't need to change when real logic lands.

export type PlanId = 'free' | 'pro' | 'ultra'

export interface CheckoutResult {
  success: boolean
  error?: string
}

// Price IDs from your Stripe dashboard (fill in before going live)
export const STRIPE_PRICE_IDS: Record<PlanId, string | null> = {
  free: null,                           // no charge for free plan
  pro: 'price_REPLACE_PRO_PRICE_ID',
  ultra: 'price_REPLACE_ULTRA_PRICE_ID',
}

/**
 * Creates a Stripe Checkout session and redirects the user.
 * Swap the body for: `window.location.href = session.url`
 */
export async function createCheckoutSession(
  _planId: PlanId,
  _userEmail: string,
): Promise<CheckoutResult> {
  // TODO: POST /api/stripe/create-checkout-session { planId, userEmail }
  // const res = await fetch('/api/stripe/create-checkout-session', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ planId: _planId, userEmail: _userEmail }),
  // })
  // const { url } = await res.json()
  // window.location.href = url

  // Stub: simulate network delay
  await new Promise((r) => setTimeout(r, 1500))
  return { success: true }
}

/**
 * Opens the Stripe Customer Portal so the user can manage/cancel their sub.
 */
export async function openCustomerPortal(_userEmail: string): Promise<void> {
  // TODO: POST /api/stripe/customer-portal { userEmail }
  // const res = await fetch('/api/stripe/customer-portal', { ... })
  // const { url } = await res.json()
  // window.location.href = url
  await new Promise((r) => setTimeout(r, 800))
}

/**
 * Cancels the active subscription at period end.
 */
export async function cancelSubscription(_userEmail: string): Promise<CheckoutResult> {
  // TODO: POST /api/stripe/cancel { userEmail }
  await new Promise((r) => setTimeout(r, 800))
  return { success: true }
}
