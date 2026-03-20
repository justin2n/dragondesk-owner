import Stripe from 'stripe';
import { query, run, get } from '../models/database';

let stripeClient: Stripe | null = null;

interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

/**
 * Get Stripe configuration from database
 */
export async function getStripeConfig(locationId?: number): Promise<StripeConfig | null> {
  try {
    let settings;
    if (locationId) {
      settings = await get(
        'SELECT * FROM billing_settings WHERE locationId = ? AND isActive = 1',
        [locationId]
      );
    }

    // Fall back to global settings (locationId = null)
    if (!settings) {
      settings = await get(
        'SELECT * FROM billing_settings WHERE locationId IS NULL AND isActive = 1'
      );
    }

    if (!settings || !settings.stripeSecretKey) {
      return null;
    }

    return {
      secretKey: settings.stripeSecretKey,
      publishableKey: settings.stripePublishableKey || '',
      webhookSecret: settings.stripeWebhookSecret || ''
    };
  } catch (error) {
    console.error('Error getting Stripe config:', error);
    return null;
  }
}

/**
 * Initialize Stripe client
 */
export async function initializeStripe(locationId?: number): Promise<Stripe | null> {
  const config = await getStripeConfig(locationId);

  if (!config) {
    return null;
  }

  stripeClient = new Stripe(config.secretKey);
  return stripeClient;
}

/**
 * Get or initialize Stripe client
 */
export async function getStripe(locationId?: number): Promise<Stripe | null> {
  if (stripeClient) {
    return stripeClient;
  }
  return initializeStripe(locationId);
}

/**
 * Test Stripe connection with provided credentials
 */
export async function testStripeConnection(secretKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const testClient = new Stripe(secretKey);
    await testClient.customers.list({ limit: 1 });
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to connect to Stripe'
    };
  }
}

/**
 * Create a Stripe customer for a member
 */
export async function createCustomer(memberId: number): Promise<{ success: boolean; customerId?: string; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    // Get member details
    const member = await get('SELECT * FROM members WHERE id = ?', [memberId]);
    if (!member) {
      return { success: false, error: 'Member not found' };
    }

    // Check if customer already exists
    const existingCustomer = await get(
      'SELECT * FROM stripe_customers WHERE memberId = ?',
      [memberId]
    );
    if (existingCustomer) {
      return { success: true, customerId: existingCustomer.stripeCustomerId };
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: member.email,
      name: `${member.firstName} ${member.lastName}`,
      phone: member.phone,
      metadata: {
        memberId: member.id.toString(),
        accountType: member.accountType,
        programType: member.programType
      }
    });

    // Save to database
    await run(
      `INSERT INTO stripe_customers (memberId, stripeCustomerId, email, name)
       VALUES (?, ?, ?, ?)`,
      [memberId, customer.id, member.email, `${member.firstName} ${member.lastName}`]
    );

    return { success: true, customerId: customer.id };
  } catch (error: any) {
    console.error('Error creating Stripe customer:', error);
    return { success: false, error: error.message || 'Failed to create customer' };
  }
}

/**
 * Get or create Stripe customer for a member
 */
export async function getOrCreateCustomer(memberId: number): Promise<string | null> {
  const existing = await get(
    'SELECT stripeCustomerId FROM stripe_customers WHERE memberId = ?',
    [memberId]
  );

  if (existing) {
    return existing.stripeCustomerId;
  }

  const result = await createCustomer(memberId);
  return result.success ? result.customerId! : null;
}

/**
 * Create a Setup Intent for adding a payment method
 */
export async function createSetupIntent(memberId: number): Promise<{ success: boolean; clientSecret?: string; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    const customerId = await getOrCreateCustomer(memberId);
    if (!customerId) {
      return { success: false, error: 'Failed to get or create customer' };
    }

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

/**
 * Attach a payment method to a customer
 */
export async function attachPaymentMethod(
  memberId: number,
  paymentMethodId: string,
  setAsDefault: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    const customer = await get(
      'SELECT * FROM stripe_customers WHERE memberId = ?',
      [memberId]
    );
    if (!customer) {
      return { success: false, error: 'Customer not found' };
    }

    // Attach payment method to customer
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.stripeCustomerId,
    });

    // Set as default if requested
    if (setAsDefault) {
      await stripe.customers.update(customer.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Update any existing default in our DB
      await run(
        'UPDATE payment_methods SET isDefault = 0 WHERE memberId = ?',
        [memberId]
      );
    }

    // Save payment method to database
    const card = paymentMethod.card;
    await run(
      `INSERT INTO payment_methods (
        memberId, stripePaymentMethodId, stripeCustomerId, type, brand, last4, expMonth, expYear, isDefault
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memberId,
        paymentMethodId,
        customer.stripeCustomerId,
        paymentMethod.type,
        card?.brand || null,
        card?.last4 || null,
        card?.exp_month || null,
        card?.exp_year || null,
        setAsDefault ? 1 : 0
      ]
    );

    // Update customer default payment method in our DB
    if (setAsDefault) {
      await run(
        'UPDATE stripe_customers SET defaultPaymentMethodId = ?, updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?',
        [paymentMethodId, memberId]
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error attaching payment method:', error);
    return { success: false, error: error.message || 'Failed to attach payment method' };
  }
}

/**
 * Detach a payment method
 */
export async function detachPaymentMethod(paymentMethodId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    // Remove from database
    await run(
      'DELETE FROM payment_methods WHERE stripePaymentMethodId = ?',
      [paymentMethodId]
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error detaching payment method:', error);
    return { success: false, error: error.message || 'Failed to detach payment method' };
  }
}

/**
 * Create a subscription for a member
 */
export async function createSubscription(
  memberId: number,
  pricingPlanId: number
): Promise<{ success: boolean; subscriptionId?: string; clientSecret?: string; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    // Get pricing plan
    const plan = await get('SELECT * FROM pricing_plans WHERE id = ?', [pricingPlanId]);
    if (!plan) {
      return { success: false, error: 'Pricing plan not found' };
    }

    // Get or create customer
    const customerId = await getOrCreateCustomer(memberId);
    if (!customerId) {
      return { success: false, error: 'Failed to get or create customer' };
    }

    // Check if plan has a Stripe price ID, if not create one
    let stripePriceId = plan.stripePriceId;
    if (!stripePriceId) {
      const priceResult = await createStripePrice(plan);
      if (!priceResult.success) {
        return { success: false, error: priceResult.error };
      }
      stripePriceId = priceResult.priceId!;
    }

    // Create subscription
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    };

    // Add trial if configured
    if (plan.trialDays > 0) {
      subscriptionParams.trial_period_days = plan.trialDays;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    // Save subscription to database
    await run(
      `INSERT INTO subscriptions (
        memberId, pricingPlanId, stripeSubscriptionId, stripeCustomerId, status,
        currentPeriodStart, currentPeriodEnd, trialStart, trialEnd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memberId,
        pricingPlanId,
        subscription.id,
        customerId,
        subscription.status,
        new Date(subscription.current_period_start * 1000).toISOString(),
        new Date(subscription.current_period_end * 1000).toISOString(),
        subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
        subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
      ]
    );

    // Get client secret for payment confirmation if needed
    const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent;

    return {
      success: true,
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret || undefined
    };
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    return { success: false, error: error.message || 'Failed to create subscription' };
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  subscriptionId: number,
  immediately: boolean = false,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    // Get subscription from database
    const subscription = await get('SELECT * FROM subscriptions WHERE id = ?', [subscriptionId]);
    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    if (immediately) {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

      await run(
        `UPDATE subscriptions SET
          status = 'canceled', canceledAt = CURRENT_TIMESTAMP, cancelReason = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason, subscriptionId]
      );
    } else {
      // Cancel at end of period
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await run(
        `UPDATE subscriptions SET
          cancelAtPeriodEnd = 1, cancelReason = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason, subscriptionId]
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    return { success: false, error: error.message || 'Failed to cancel subscription' };
  }
}

/**
 * Resume a canceled subscription (if canceled at period end)
 */
export async function resumeSubscription(subscriptionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    const subscription = await get('SELECT * FROM subscriptions WHERE id = ?', [subscriptionId]);
    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await run(
      `UPDATE subscriptions SET
        cancelAtPeriodEnd = 0, cancelReason = NULL, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [subscriptionId]
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error resuming subscription:', error);
    return { success: false, error: error.message || 'Failed to resume subscription' };
  }
}

/**
 * Update subscription to a different plan
 */
export async function updateSubscriptionPlan(
  subscriptionId: number,
  newPricingPlanId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    const subscription = await get('SELECT * FROM subscriptions WHERE id = ?', [subscriptionId]);
    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    const newPlan = await get('SELECT * FROM pricing_plans WHERE id = ?', [newPricingPlanId]);
    if (!newPlan) {
      return { success: false, error: 'New pricing plan not found' };
    }

    // Ensure plan has Stripe price ID
    let stripePriceId = newPlan.stripePriceId;
    if (!stripePriceId) {
      const priceResult = await createStripePrice(newPlan);
      if (!priceResult.success) {
        return { success: false, error: priceResult.error };
      }
      stripePriceId = priceResult.priceId!;
    }

    // Get current subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

    // Update subscription
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: stripeSubscription.items.data[0].id,
        price: stripePriceId,
      }],
      proration_behavior: 'create_prorations',
    });

    // Update database
    await run(
      `UPDATE subscriptions SET pricingPlanId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [newPricingPlanId, subscriptionId]
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return { success: false, error: error.message || 'Failed to update subscription' };
  }
}

/**
 * Create a Stripe Product and Price for a pricing plan
 */
export async function createStripePrice(plan: any): Promise<{ success: boolean; priceId?: string; productId?: string; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    // Create product if needed
    let productId = plan.stripeProductId;
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
        metadata: {
          planId: plan.id.toString(),
          accountType: plan.accountType,
          programType: plan.programType || 'All'
        }
      });
      productId = product.id;

      // Save product ID
      await run(
        'UPDATE pricing_plans SET stripeProductId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [productId, plan.id]
      );
    }

    // Create price
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.amount, // Amount in cents
      currency: plan.currency || 'usd',
      recurring: {
        interval: plan.billingInterval,
        interval_count: plan.intervalCount || 1
      },
      metadata: {
        planId: plan.id.toString()
      }
    });

    // Save price ID
    await run(
      'UPDATE pricing_plans SET stripePriceId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [price.id, plan.id]
    );

    return { success: true, priceId: price.id, productId };
  } catch (error: any) {
    console.error('Error creating Stripe price:', error);
    return { success: false, error: error.message || 'Failed to create Stripe price' };
  }
}

/**
 * Retry a failed invoice payment
 */
export async function retryInvoicePayment(invoiceId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe is not configured' };
    }

    const invoice = await get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    if (!invoice.stripeInvoiceId) {
      return { success: false, error: 'No Stripe invoice ID' };
    }

    await stripe.invoices.pay(invoice.stripeInvoiceId);

    return { success: true };
  } catch (error: any) {
    console.error('Error retrying invoice payment:', error);
    return { success: false, error: error.message || 'Failed to retry payment' };
  }
}

/**
 * Get Stripe publishable key for client
 */
export async function getPublishableKey(locationId?: number): Promise<string | null> {
  const config = await getStripeConfig(locationId);
  return config?.publishableKey || null;
}

export default {
  getStripeConfig,
  initializeStripe,
  getStripe,
  testStripeConnection,
  createCustomer,
  getOrCreateCustomer,
  createSetupIntent,
  attachPaymentMethod,
  detachPaymentMethod,
  createSubscription,
  cancelSubscription,
  resumeSubscription,
  updateSubscriptionPlan,
  createStripePrice,
  retryInvoicePayment,
  getPublishableKey
};
