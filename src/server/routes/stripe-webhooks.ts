import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query, run, get } from '../models/database';
import { getStripeConfig } from '../services/stripe';

const router = Router();

// Webhook handler - no auth middleware, uses Stripe signature verification
router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const config = await getStripeConfig();

    if (!config) {
      console.error('Stripe not configured');
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const stripe = new Stripe(config.secretKey);

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        config.webhookSecret
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Log the event
    await run(
      `INSERT INTO billing_events (stripeEventId, eventType, data) VALUES (?, ?, ?)`,
      [event.id, event.type, JSON.stringify(event.data.object)]
    );

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.created':
        await handleInvoiceCreated(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object as Stripe.Invoice);
        break;

      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        break;

      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await run(
      `UPDATE billing_events SET processed = 1, processedAt = CURRENT_TIMESTAMP WHERE stripeEventId = ?`,
      [event.id]
    );

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);

    // Log error
    const sig = req.headers['stripe-signature'];
    if (sig) {
      await run(
        `UPDATE billing_events SET error = ? WHERE stripeEventId = (
          SELECT stripeEventId FROM billing_events ORDER BY createdAt DESC LIMIT 1
        )`,
        [error.message]
      );
    }

    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  try {
    // Find our subscription record
    const localSubscription = await get(
      'SELECT * FROM subscriptions WHERE stripeSubscriptionId = ?',
      [subscription.id]
    );

    if (!localSubscription) {
      console.log(`Subscription not found locally: ${subscription.id}`);
      return;
    }

    // Update subscription status and dates
    await run(
      `UPDATE subscriptions SET
        status = ?,
        currentPeriodStart = ?,
        currentPeriodEnd = ?,
        cancelAtPeriodEnd = ?,
        canceledAt = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE stripeSubscriptionId = ?`,
      [
        subscription.status,
        new Date((subscription as any).current_period_start * 1000).toISOString(),
        new Date((subscription as any).current_period_end * 1000).toISOString(),
        subscription.cancel_at_period_end ? 1 : 0,
        subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        subscription.id
      ]
    );

    // Update member status based on subscription status
    const memberId = localSubscription.memberId;

    if (subscription.status === 'active') {
      await run(
        `UPDATE members SET accountStatus = 'member', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [memberId]
      );
    } else if (subscription.status === 'trialing') {
      await run(
        `UPDATE members SET accountStatus = 'trialer', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [memberId]
      );
    }

    console.log(`Updated subscription ${subscription.id} to status: ${subscription.status}`);
  } catch (error) {
    console.error('Error handling subscription update:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const localSubscription = await get(
      'SELECT * FROM subscriptions WHERE stripeSubscriptionId = ?',
      [subscription.id]
    );

    if (!localSubscription) {
      console.log(`Subscription not found locally: ${subscription.id}`);
      return;
    }

    // Update subscription status
    await run(
      `UPDATE subscriptions SET
        status = 'canceled',
        canceledAt = CURRENT_TIMESTAMP,
        updatedAt = CURRENT_TIMESTAMP
       WHERE stripeSubscriptionId = ?`,
      [subscription.id]
    );

    // Update member status
    await run(
      `UPDATE members SET accountStatus = 'cancelled', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [localSubscription.memberId]
    );

    console.log(`Subscription ${subscription.id} deleted`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
    throw error;
  }
}

async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  try {
    // Find member from customer
    const customer = await get(
      'SELECT * FROM stripe_customers WHERE stripeCustomerId = ?',
      [invoice.customer]
    );

    if (!customer) {
      console.log(`Customer not found: ${invoice.customer}`);
      return;
    }

    // Find subscription
    let subscriptionId = null;
    if ((invoice as any).subscription) {
      const subscription = await get(
        'SELECT id FROM subscriptions WHERE stripeSubscriptionId = ?',
        [(invoice as any).subscription]
      );
      subscriptionId = subscription?.id;
    }

    // Insert or update invoice
    const existing = await get(
      'SELECT * FROM invoices WHERE stripeInvoiceId = ?',
      [invoice.id]
    );

    if (existing) {
      await run(
        `UPDATE invoices SET
          status = ?,
          amountDue = ?,
          amountPaid = ?,
          amountRemaining = ?,
          subtotal = ?,
          tax = ?,
          total = ?,
          invoiceUrl = ?,
          invoicePdfUrl = ?,
          updatedAt = CURRENT_TIMESTAMP
         WHERE stripeInvoiceId = ?`,
        [
          invoice.status,
          invoice.amount_due,
          invoice.amount_paid,
          invoice.amount_remaining,
          invoice.subtotal,
          (invoice as any).tax || 0,
          invoice.total,
          invoice.hosted_invoice_url,
          invoice.invoice_pdf,
          invoice.id
        ]
      );
    } else {
      await run(
        `INSERT INTO invoices (
          memberId, subscriptionId, stripeInvoiceId, invoiceNumber, status,
          amountDue, amountPaid, amountRemaining, subtotal, tax, total,
          currency, invoiceUrl, invoicePdfUrl, periodStart, periodEnd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customer.memberId,
          subscriptionId,
          invoice.id,
          invoice.number,
          invoice.status,
          invoice.amount_due,
          invoice.amount_paid,
          invoice.amount_remaining,
          invoice.subtotal,
          (invoice as any).tax || 0,
          invoice.total,
          invoice.currency,
          invoice.hosted_invoice_url,
          invoice.invoice_pdf,
          invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
          invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null
        ]
      );
    }

    console.log(`Invoice ${invoice.id} created/updated`);
  } catch (error) {
    console.error('Error handling invoice created:', error);
    throw error;
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  try {
    await run(
      `UPDATE invoices SET
        status = 'paid',
        amountPaid = ?,
        amountRemaining = 0,
        paidAt = CURRENT_TIMESTAMP,
        stripePaymentIntentId = ?,
        stripeChargeId = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE stripeInvoiceId = ?`,
      [
        invoice.amount_paid,
        (invoice as any).payment_intent,
        (invoice as any).charge,
        invoice.id
      ]
    );

    console.log(`Invoice ${invoice.id} paid`);
  } catch (error) {
    console.error('Error handling invoice paid:', error);
    throw error;
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  try {
    const attemptCount = invoice.attempt_count || 1;

    await run(
      `UPDATE invoices SET
        status = 'open',
        attemptCount = ?,
        nextPaymentAttempt = ?,
        lastPaymentError = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE stripeInvoiceId = ?`,
      [
        attemptCount,
        invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toISOString()
          : null,
        invoice.last_finalization_error?.message || 'Payment failed',
        invoice.id
      ]
    );

    console.log(`Invoice ${invoice.id} payment failed (attempt ${attemptCount})`);
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
    throw error;
  }
}

async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  try {
    await run(
      `UPDATE invoices SET
        status = ?,
        invoiceUrl = ?,
        invoicePdfUrl = ?,
        dueDate = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE stripeInvoiceId = ?`,
      [
        invoice.status,
        invoice.hosted_invoice_url,
        invoice.invoice_pdf,
        invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        invoice.id
      ]
    );

    console.log(`Invoice ${invoice.id} finalized`);
  } catch (error) {
    console.error('Error handling invoice finalized:', error);
    throw error;
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  try {
    // Find customer
    const customer = await get(
      'SELECT * FROM stripe_customers WHERE stripeCustomerId = ?',
      [paymentMethod.customer]
    );

    if (!customer) {
      console.log(`Customer not found: ${paymentMethod.customer}`);
      return;
    }

    // Check if already exists
    const existing = await get(
      'SELECT * FROM payment_methods WHERE stripePaymentMethodId = ?',
      [paymentMethod.id]
    );

    if (existing) {
      return; // Already tracked
    }

    const card = paymentMethod.card;

    await run(
      `INSERT INTO payment_methods (
        memberId, stripePaymentMethodId, stripeCustomerId, type, brand, last4, expMonth, expYear
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer.memberId,
        paymentMethod.id,
        paymentMethod.customer,
        paymentMethod.type,
        card?.brand || null,
        card?.last4 || null,
        card?.exp_month || null,
        card?.exp_year || null
      ]
    );

    console.log(`Payment method ${paymentMethod.id} attached`);
  } catch (error) {
    console.error('Error handling payment method attached:', error);
    throw error;
  }
}

async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
  try {
    await run(
      'DELETE FROM payment_methods WHERE stripePaymentMethodId = ?',
      [paymentMethod.id]
    );

    console.log(`Payment method ${paymentMethod.id} detached`);
  } catch (error) {
    console.error('Error handling payment method detached:', error);
    throw error;
  }
}

export default router;
