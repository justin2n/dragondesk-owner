import Stripe from 'stripe';
import { pool } from '../models/database';

// Per-location client cache — key is locationId (or 'global' for null)
const stripeClients = new Map<string, Stripe>();

interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

export async function getStripeConfig(locationId?: number): Promise<StripeConfig | null> {
  try {
    let result;
    if (locationId) {
      result = await pool.query(
        `SELECT * FROM billing_settings WHERE "locationId" = $1 AND "isActive" = true LIMIT 1`,
        [locationId]
      );
    }

    // Fall back to global settings
    if (!result || result.rows.length === 0) {
      result = await pool.query(
        `SELECT * FROM billing_settings WHERE "locationId" IS NULL AND "isActive" = true LIMIT 1`
      );
    }

    const settings = result?.rows[0];
    if (!settings?.stripeSecretKey) return null;

    return {
      secretKey: settings.stripeSecretKey,
      publishableKey: settings.stripePublishableKey || '',
      webhookSecret: settings.stripeWebhookSecret || '',
    };
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    return null;
  }
}

export async function getStripe(locationId?: number): Promise<Stripe | null> {
  const cacheKey = locationId ? String(locationId) : 'global';

  // Always re-fetch config so key changes take effect without restart
  const config = await getStripeConfig(locationId);
  if (!config) return null;

  // Return cached client only if key hasn't changed
  const cached = stripeClients.get(cacheKey);
  if (cached) return cached;

  const client = new Stripe(config.secretKey);
  stripeClients.set(cacheKey, client);
  return client;
}

// Call this after saving new keys so the cache is invalidated
export function invalidateStripeCache(locationId?: number) {
  const cacheKey = locationId ? String(locationId) : 'global';
  stripeClients.delete(cacheKey);
}

export async function testStripeConnection(secretKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const testClient = new Stripe(secretKey);
    await testClient.customers.list({ limit: 1 });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to connect to Stripe' };
  }
}

export async function createCustomer(memberId: number): Promise<{ success: boolean; customerId?: string; error?: string }> {
  try {
    // Get member's locationId to use the right Stripe account
    const memberResult = await pool.query('SELECT * FROM members WHERE id = $1', [memberId]);
    const member = memberResult.rows[0];
    if (!member) return { success: false, error: 'Member not found' };

    const stripe = await getStripe(member.locationId || undefined);
    if (!stripe) return { success: false, error: 'Stripe is not configured for this location' };

    const existingResult = await pool.query('SELECT * FROM stripe_customers WHERE "memberId" = $1', [memberId]);
    if (existingResult.rows.length > 0) {
      return { success: true, customerId: existingResult.rows[0].stripeCustomerId };
    }

    const customer = await stripe.customers.create({
      email: member.email,
      name: `${member.firstName} ${member.lastName}`,
      phone: member.phone,
      metadata: { memberId: member.id.toString(), programType: member.programType },
    });

    await pool.query(
      `INSERT INTO stripe_customers ("memberId", "stripeCustomerId", email, name) VALUES ($1,$2,$3,$4)`,
      [memberId, customer.id, member.email, `${member.firstName} ${member.lastName}`]
    );

    return { success: true, customerId: customer.id };
  } catch (error: any) {
    console.error('Error creating Stripe customer:', error);
    return { success: false, error: error.message || 'Failed to create customer' };
  }
}

export async function getOrCreateCustomer(memberId: number): Promise<string | null> {
  const result = await pool.query('SELECT "stripeCustomerId" FROM stripe_customers WHERE "memberId" = $1', [memberId]);
  if (result.rows.length > 0) return result.rows[0].stripeCustomerId;

  const created = await createCustomer(memberId);
  return created.success ? created.customerId! : null;
}

async function getMemberLocationId(memberId: number): Promise<number | undefined> {
  const result = await pool.query('SELECT "locationId" FROM members WHERE id = $1', [memberId]);
  return result.rows[0]?.locationId || undefined;
}

export async function createSetupIntent(memberId: number): Promise<{ success: boolean; clientSecret?: string; error?: string }> {
  try {
    const locationId = await getMemberLocationId(memberId);
    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured for this location' };

    const customerId = await getOrCreateCustomer(memberId);
    if (!customerId) return { success: false, error: 'Failed to get or create customer' };

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    return { success: true, clientSecret: setupIntent.client_secret! };
  } catch (error: any) {
    console.error('Error creating setup intent:', error);
    return { success: false, error: error.message || 'Failed to create setup intent' };
  }
}

export async function attachPaymentMethod(
  memberId: number,
  paymentMethodId: string,
  setAsDefault: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const locationId = await getMemberLocationId(memberId);
    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured for this location' };

    const customerResult = await pool.query('SELECT * FROM stripe_customers WHERE "memberId" = $1', [memberId]);
    const customer = customerResult.rows[0];
    if (!customer) return { success: false, error: 'Customer not found' };

    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.stripeCustomerId,
    });

    if (setAsDefault) {
      await stripe.customers.update(customer.stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      await pool.query(`UPDATE payment_methods SET "isDefault" = false WHERE "memberId" = $1`, [memberId]);
    }

    const card = paymentMethod.card;
    await pool.query(
      `INSERT INTO payment_methods ("memberId", "stripePaymentMethodId", "stripeCustomerId", type, brand, last4, "expMonth", "expYear", "isDefault")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [memberId, paymentMethodId, customer.stripeCustomerId, paymentMethod.type, card?.brand || null,
       card?.last4 || null, card?.exp_month || null, card?.exp_year || null, setAsDefault]
    );

    if (setAsDefault) {
      await pool.query(
        `UPDATE stripe_customers SET "defaultPaymentMethodId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "memberId" = $2`,
        [paymentMethodId, memberId]
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error attaching payment method:', error);
    return { success: false, error: error.message || 'Failed to attach payment method' };
  }
}

export async function detachPaymentMethod(paymentMethodId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the member to get the right Stripe account
    const pmResult = await pool.query(
      `SELECT pm."memberId", m."locationId" FROM payment_methods pm JOIN members m ON pm."memberId" = m.id WHERE pm."stripePaymentMethodId" = $1`,
      [paymentMethodId]
    );
    const locationId = pmResult.rows[0]?.locationId || undefined;

    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured' };

    await stripe.paymentMethods.detach(paymentMethodId);
    await pool.query('DELETE FROM payment_methods WHERE "stripePaymentMethodId" = $1', [paymentMethodId]);

    return { success: true };
  } catch (error: any) {
    console.error('Error detaching payment method:', error);
    return { success: false, error: error.message || 'Failed to detach payment method' };
  }
}

export async function createSubscription(
  memberId: number,
  pricingPlanId: number
): Promise<{ success: boolean; subscriptionId?: string; clientSecret?: string; error?: string }> {
  try {
    const locationId = await getMemberLocationId(memberId);
    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured for this location' };

    const planResult = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [pricingPlanId]);
    const plan = planResult.rows[0];
    if (!plan) return { success: false, error: 'Pricing plan not found' };

    const customerId = await getOrCreateCustomer(memberId);
    if (!customerId) return { success: false, error: 'Failed to get or create customer' };

    let stripePriceId = plan.stripePriceId;
    if (!stripePriceId) {
      const priceResult = await createStripePrice(plan, locationId);
      if (!priceResult.success) return { success: false, error: priceResult.error };
      stripePriceId = priceResult.priceId!;
    }

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    };

    if (plan.trialDays > 0) subscriptionParams.trial_period_days = plan.trialDays;

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    await pool.query(
      `INSERT INTO subscriptions ("memberId", "pricingPlanId", "stripeSubscriptionId", "stripeCustomerId", status,
        "currentPeriodStart", "currentPeriodEnd", "trialStart", "trialEnd")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        memberId, pricingPlanId, subscription.id, customerId, subscription.status,
        new Date((subscription as any).current_period_start * 1000).toISOString(),
        new Date((subscription as any).current_period_end * 1000).toISOString(),
        subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
        subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      ]
    );

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = (latestInvoice as any)?.payment_intent as Stripe.PaymentIntent;

    return { success: true, subscriptionId: subscription.id, clientSecret: paymentIntent?.client_secret || undefined };
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    return { success: false, error: error.message || 'Failed to create subscription' };
  }
}

export async function cancelSubscription(
  subscriptionId: number,
  immediately: boolean = false,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subResult = await pool.query('SELECT * FROM subscriptions WHERE id = $1', [subscriptionId]);
    const subscription = subResult.rows[0];
    if (!subscription) return { success: false, error: 'Subscription not found' };

    const locationId = await getMemberLocationId(subscription.memberId);
    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured' };

    if (immediately) {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      await pool.query(
        `UPDATE subscriptions SET status = 'canceled', "canceledAt" = CURRENT_TIMESTAMP, "cancelReason" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [reason, subscriptionId]
      );
    } else {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
      await pool.query(
        `UPDATE subscriptions SET "cancelAtPeriodEnd" = true, "cancelReason" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [reason, subscriptionId]
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    return { success: false, error: error.message || 'Failed to cancel subscription' };
  }
}

export async function resumeSubscription(subscriptionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const subResult = await pool.query('SELECT * FROM subscriptions WHERE id = $1', [subscriptionId]);
    const subscription = subResult.rows[0];
    if (!subscription) return { success: false, error: 'Subscription not found' };

    const locationId = await getMemberLocationId(subscription.memberId);
    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured' };

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: false });
    await pool.query(
      `UPDATE subscriptions SET "cancelAtPeriodEnd" = false, "cancelReason" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $1`,
      [subscriptionId]
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error resuming subscription:', error);
    return { success: false, error: error.message || 'Failed to resume subscription' };
  }
}

export async function updateSubscriptionPlan(
  subscriptionId: number,
  newPricingPlanId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const subResult = await pool.query('SELECT * FROM subscriptions WHERE id = $1', [subscriptionId]);
    const subscription = subResult.rows[0];
    if (!subscription) return { success: false, error: 'Subscription not found' };

    const locationId = await getMemberLocationId(subscription.memberId);
    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured' };

    const planResult = await pool.query('SELECT * FROM pricing_plans WHERE id = $1', [newPricingPlanId]);
    const newPlan = planResult.rows[0];
    if (!newPlan) return { success: false, error: 'New pricing plan not found' };

    let stripePriceId = newPlan.stripePriceId;
    if (!stripePriceId) {
      const priceResult = await createStripePrice(newPlan, locationId);
      if (!priceResult.success) return { success: false, error: priceResult.error };
      stripePriceId = priceResult.priceId!;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{ id: stripeSubscription.items.data[0].id, price: stripePriceId }],
      proration_behavior: 'create_prorations',
    });

    await pool.query(
      `UPDATE subscriptions SET "pricingPlanId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
      [newPricingPlanId, subscriptionId]
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return { success: false, error: error.message || 'Failed to update subscription' };
  }
}

export async function createStripePrice(
  plan: any,
  locationId?: number
): Promise<{ success: boolean; priceId?: string; productId?: string; error?: string }> {
  try {
    const stripe = await getStripe(locationId ?? plan.locationId ?? undefined);
    if (!stripe) return { success: false, error: 'Stripe is not configured for this location' };

    let productId = plan.stripeProductId;
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
        metadata: { planId: plan.id.toString(), programType: plan.programType || 'All' },
      });
      productId = product.id;
      await pool.query(
        `UPDATE pricing_plans SET "stripeProductId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
        [productId, plan.id]
      );
    }

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.amount,
      currency: plan.currency || 'usd',
      recurring: { interval: plan.billingInterval, interval_count: plan.intervalCount || 1 },
      metadata: { planId: plan.id.toString() },
    });

    await pool.query(
      `UPDATE pricing_plans SET "stripePriceId" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2`,
      [price.id, plan.id]
    );

    return { success: true, priceId: price.id, productId };
  } catch (error: any) {
    console.error('Error creating Stripe price:', error);
    return { success: false, error: error.message || 'Failed to create Stripe price' };
  }
}

export async function retryInvoicePayment(invoiceId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const invoiceResult = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    const invoice = invoiceResult.rows[0];
    if (!invoice) return { success: false, error: 'Invoice not found' };
    if (!invoice.stripeInvoiceId) return { success: false, error: 'No Stripe invoice ID' };

    const locationId = await getMemberLocationId(invoice.memberId);
    const stripe = await getStripe(locationId);
    if (!stripe) return { success: false, error: 'Stripe is not configured' };

    await stripe.invoices.pay(invoice.stripeInvoiceId);
    return { success: true };
  } catch (error: any) {
    console.error('Error retrying invoice payment:', error);
    return { success: false, error: error.message || 'Failed to retry payment' };
  }
}

export async function getPublishableKey(locationId?: number): Promise<string | null> {
  const config = await getStripeConfig(locationId);
  return config?.publishableKey || null;
}

export default {
  getStripeConfig, getStripe, invalidateStripeCache, testStripeConnection,
  createCustomer, getOrCreateCustomer, createSetupIntent, attachPaymentMethod,
  detachPaymentMethod, createSubscription, cancelSubscription, resumeSubscription,
  updateSubscriptionPlan, createStripePrice, retryInvoicePayment, getPublishableKey,
};
