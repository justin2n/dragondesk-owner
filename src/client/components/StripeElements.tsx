import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { api } from '../utils/api';
import styles from './StripeElements.module.css';

interface PaymentFormProps {
  memberId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ memberId, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Create setup intent on server
      const { clientSecret } = await api.post('/payment-methods/setup-intent', { memberId });

      if (!clientSecret) {
        throw new Error('Failed to create setup intent');
      }

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Confirm card setup
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }

      if (setupIntent && setupIntent.payment_method) {
        // Attach payment method to member
        await api.post(`/payment-methods/${setupIntent.payment_method}/attach`, {
          memberId,
          setAsDefault: true,
        });

        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save payment method');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.cardWrapper}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#ffffff',
                '::placeholder': {
                  color: '#9ca3af',
                },
              },
              invalid: {
                color: '#dc2626',
              },
            },
          }}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.buttons}>
        <button
          type="button"
          onClick={onCancel}
          className={styles.cancelBtn}
          disabled={processing}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={!stripe || processing}
        >
          {processing ? 'Saving...' : 'Save Payment Method'}
        </button>
      </div>
    </form>
  );
};

interface StripeElementsWrapperProps {
  memberId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const StripeElementsWrapper: React.FC<StripeElementsWrapperProps> = ({
  memberId,
  onSuccess,
  onCancel,
}) => {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStripeKey = async () => {
      try {
        const response = await api.get('/billing/publishable-key');
        if (response?.publishableKey) {
          setStripePromise(loadStripe(response.publishableKey));
        } else {
          setError('Stripe is not configured. Please set up Stripe in Settings.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load Stripe configuration');
      } finally {
        setLoading(false);
      }
    };

    loadStripeKey();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading payment form...</div>;
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p>{error}</p>
        <button onClick={onCancel} className={styles.cancelBtn}>
          Close
        </button>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className={styles.errorContainer}>
        <p>Stripe is not configured.</p>
        <button onClick={onCancel} className={styles.cancelBtn}>
          Close
        </button>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm memberId={memberId} onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  );
};

export default StripeElementsWrapper;
