import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import styles from './POS.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface Location { id: number; name: string; }
interface Product {
  id: number; name: string; description?: string; price: number;
  sku?: string; category: string; isActive: boolean; inventory: number | null;
}
interface CartItem { product: Product; quantity: number; }
interface Member { id: number; firstName: string; lastName: string; email: string; }

type ViewMode = 'loading' | 'select-location' | 'pos' | 'checkout' | 'receipt';
type PaymentMethod = 'cash' | 'card' | 'terminal';
type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'collecting' | 'processing' | 'error';

// ── Card Payment Form ────────────────────────────────────────────────────────

const CardPaymentForm: React.FC<{
  total: number;
  locationId: number;
  onSuccess: (intentId: string) => void;
  onCancel: () => void;
}> = ({ total, locationId, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch('/api/pos/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: total, locationId, method: 'card' }),
      });
      const { clientSecret, id } = await res.json();
      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Card element not found');
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });
      if (stripeError) throw new Error(stripeError.message);
      if (paymentIntent?.status === 'succeeded') onSuccess(id);
    } catch (err: any) {
      setError(err.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.cardForm}>
      <div className={styles.cardElementWrapper}>
        <CardElement options={{ style: { base: { fontSize: '16px', color: 'var(--color-text-primary)' } } }} />
      </div>
      {error && <div className={styles.paymentError}>{error}</div>}
      <div className={styles.paymentActions}>
        <button type="button" onClick={onCancel} className={styles.cancelPayBtn} disabled={processing}>Cancel</button>
        <button type="submit" className={styles.chargeBtn} disabled={processing || !stripe}>
          {processing ? 'Processing…' : `Charge $${(total / 100).toFixed(2)}`}
        </button>
      </div>
    </form>
  );
};

// ── Main POS Component ───────────────────────────────────────────────────────

const POS: React.FC = () => {
  const { locationId: paramLocationId } = useParams<{ locationId?: string }>();

  // Location state
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [locations, setLocations] = useState<Location[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationId, setLocationId] = useState<number | null>(
    paramLocationId ? parseInt(paramLocationId) : null
  );

  // Products / catalog
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Member linking
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberSearching, setMemberSearching] = useState(false);

  // Checkout
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);

  // Terminal
  const terminalRef = useRef<any>(null);
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('idle');
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [readers, setReaders] = useState<any[]>([]);
  const [connectedReader, setConnectedReader] = useState<any>(null);

  // Receipt
  const [lastTransaction, setLastTransaction] = useState<any>(null);

  // ── Bootstrap ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/kiosk/locations').then(r => r.json()).then((locs: Location[]) => {
      setLocations(locs);
      if (locationId) {
        const loc = locs.find(l => l.id === locationId);
        if (loc) { setLocation(loc); loadProducts(locationId); setViewMode('pos'); }
        else setViewMode('select-location');
      } else if (locs.length === 1) {
        setLocation(locs[0]); setLocationId(locs[0].id);
        loadProducts(locs[0].id); setViewMode('pos');
      } else {
        setViewMode(locs.length > 0 ? 'select-location' : 'pos');
      }
    }).catch(() => setViewMode('pos'));
  }, []);

  useEffect(() => {
    // Load Stripe publishable key for card payments
    fetch('/api/billing/settings').then(r => r.json()).then(cfg => {
      if (cfg.stripePublishableKey) setStripePromise(loadStripe(cfg.stripePublishableKey));
    }).catch(() => {});
  }, []);

  const loadProducts = async (locId: number) => {
    const res = await fetch(`/api/pos/products?locationId=${locId}`);
    const data: Product[] = await res.json();
    setProducts(data);
    const cats = ['All', ...Array.from(new Set(data.map(p => p.category))).sort()];
    setCategories(cats);
  };

  const selectLocation = (loc: Location) => {
    setLocation(loc); setLocationId(loc.id);
    loadProducts(loc.id); setViewMode('pos');
  };

  // ── Cart ─────────────────────────────────────────────────────────────────

  const addToCart = (product: Product) => {
    if (product.inventory === 0) return;
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (productId: number, delta: number) => {
    setCart(prev => prev
      .map(i => i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0)
    );
  };

  const clearCart = () => { setCart([]); setSelectedMember(null); setMemberQuery(''); };

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const tax = 0; // tax can be configured later
  const total = subtotal + tax;
  const change = cashReceived ? Math.round(parseFloat(cashReceived) * 100) - total : 0;

  // ── Member Search ────────────────────────────────────────────────────────

  const searchMembers = useCallback(async (q: string) => {
    if (q.length < 2) { setMemberResults([]); return; }
    setMemberSearching(true);
    try {
      const res = await fetch(`/api/kiosk/member/lookup?search=${encodeURIComponent(q)}&locationId=${locationId || ''}`);
      const data = await res.json();
      setMemberResults(data || []);
    } finally {
      setMemberSearching(false);
    }
  }, [locationId]);

  useEffect(() => {
    const t = setTimeout(() => searchMembers(memberQuery), 300);
    return () => clearTimeout(t);
  }, [memberQuery, searchMembers]);

  // ── Stripe Terminal ──────────────────────────────────────────────────────

  const loadTerminalSDK = (): Promise<any> =>
    new Promise((resolve, reject) => {
      const w = window as any;
      if (w.StripeTerminal) { resolve(w.StripeTerminal); return; }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/terminal/v1/';
      script.onload = () => resolve(w.StripeTerminal);
      script.onerror = () => reject(new Error('Failed to load Stripe Terminal SDK'));
      document.head.appendChild(script);
    });

  const initTerminal = async () => {
    if (terminalRef.current) return;
    setTerminalStatus('connecting');
    setTerminalError(null);
    try {
      const StripeTerminal = await loadTerminalSDK();
      terminalRef.current = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const r = await fetch('/api/pos/connection-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationId }),
          });
          const { secret } = await r.json();
          return secret;
        },
        onUnexpectedReaderDisconnect: () => {
          setConnectedReader(null);
          setTerminalStatus('idle');
          setTerminalError('Reader disconnected unexpectedly.');
        },
      });

      const result = await terminalRef.current.discoverReaders({ simulated: false });
      if (result.error) throw new Error(result.error.message);
      setReaders(result.discoveredReaders);
      setTerminalStatus(result.discoveredReaders.length > 0 ? 'idle' : 'error');
      if (result.discoveredReaders.length === 0) setTerminalError('No readers found. Make sure your reader is powered on.');
    } catch (err: any) {
      setTerminalStatus('error');
      setTerminalError(err.message || 'Failed to initialize terminal');
    }
  };

  const connectReader = async (reader: any) => {
    setTerminalStatus('connecting');
    const result = await terminalRef.current.connectReader(reader);
    if (result.error) {
      setTerminalStatus('error');
      setTerminalError(result.error.message);
    } else {
      setConnectedReader(result.reader);
      setTerminalStatus('connected');
    }
  };

  const collectTerminalPayment = async () => {
    setTerminalStatus('collecting');
    setTerminalError(null);
    try {
      const intentRes = await fetch('/api/pos/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: total, locationId, method: 'terminal' }),
      });
      const { clientSecret, id: intentId } = await intentRes.json();

      const collectResult = await terminalRef.current.collectPaymentMethod(clientSecret);
      if (collectResult.error) throw new Error(collectResult.error.message);

      setTerminalStatus('processing');
      const processResult = await terminalRef.current.processPayment(collectResult.paymentIntent);
      if (processResult.error) throw new Error(processResult.error.message);

      // Capture server-side
      await fetch(`/api/pos/capture-payment/${intentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      });

      await recordTransaction(intentId);
    } catch (err: any) {
      setTerminalStatus('connected');
      setTerminalError(err.message || 'Payment failed');
    }
  };

  // ── Checkout / Record Transaction ────────────────────────────────────────

  const recordTransaction = async (stripePaymentIntentId?: string) => {
    const body = {
      locationId,
      memberId: selectedMember?.id || null,
      items: cart.map(i => ({
        productId: i.product.id,
        productName: i.product.name,
        productPrice: i.product.price,
        quantity: i.quantity,
      })),
      subtotal,
      tax,
      total,
      paymentMethod,
      stripePaymentIntentId: stripePaymentIntentId || null,
      cashReceived: paymentMethod === 'cash' ? Math.round(parseFloat(cashReceived) * 100) : null,
      changeGiven: paymentMethod === 'cash' ? change : null,
    };

    const res = await fetch('/api/pos/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const tx = await res.json();
    setLastTransaction({ ...tx, items: cart, member: selectedMember });
    setViewMode('receipt');
    clearCart();
    setCashReceived('');
    if (locationId) loadProducts(locationId);
  };

  const handleCashCheckout = async () => {
    if (change < 0) return;
    await recordTransaction();
  };

  const handleCardSuccess = async (intentId: string) => {
    await recordTransaction(intentId);
  };

  const resetToPos = () => {
    setViewMode('pos');
    setLastTransaction(null);
    setTerminalStatus(connectedReader ? 'connected' : 'idle');
    setTerminalError(null);
  };

  // ── Filtered Products ────────────────────────────────────────────────────

  const filteredProducts = activeCategory === 'All'
    ? products
    : products.filter(p => p.category === activeCategory);

  // ── Render ───────────────────────────────────────────────────────────────

  if (viewMode === 'loading') {
    return <div className={styles.splash}><div className={styles.spinner} /></div>;
  }

  if (viewMode === 'select-location') {
    return (
      <div className={styles.splash}>
        <h1 className={styles.splashTitle}>Select Location</h1>
        <div className={styles.locationGrid}>
          {locations.map(loc => (
            <button key={loc.id} className={styles.locationCard} onClick={() => selectLocation(loc)}>
              {loc.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === 'receipt' && lastTransaction) {
    return (
      <div className={styles.receiptScreen}>
        <div className={styles.receiptCard}>
          <div className={styles.receiptCheck}>✓</div>
          <h2 className={styles.receiptTitle}>Sale Complete</h2>
          {lastTransaction.member && (
            <p className={styles.receiptMember}>{lastTransaction.member.firstName} {lastTransaction.member.lastName}</p>
          )}
          <div className={styles.receiptItems}>
            {lastTransaction.items.map((item: CartItem, idx: number) => (
              <div key={idx} className={styles.receiptItem}>
                <span>{item.quantity}× {item.product.name}</span>
                <span>${((item.product.price * item.quantity) / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className={styles.receiptDivider} />
          <div className={styles.receiptTotal}>
            <span>Total</span>
            <span>${(lastTransaction.total / 100).toFixed(2)}</span>
          </div>
          {lastTransaction.paymentMethod === 'cash' && lastTransaction.changeGiven > 0 && (
            <div className={styles.receiptChange}>
              Change: ${(lastTransaction.changeGiven / 100).toFixed(2)}
            </div>
          )}
          <button className={styles.newSaleBtn} onClick={resetToPos}>New Sale</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pos}>
      {/* Header */}
      <div className={styles.posHeader}>
        <div className={styles.posHeaderLeft}>
          <span className={styles.posLogo}>DragonDesk POS</span>
          {location && <span className={styles.posLocation}>{location.name}</span>}
        </div>
        <div className={styles.posHeaderRight}>
          <span className={styles.posTime}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      <div className={styles.posBody}>
        {/* Left — Product Catalog */}
        <div className={styles.catalog}>
          <div className={styles.categoryTabs}>
            {categories.map(cat => (
              <button
                key={cat}
                className={`${styles.categoryTab} ${activeCategory === cat ? styles.activeCat : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className={styles.productGrid}>
            {filteredProducts.map(product => (
              <button
                key={product.id}
                className={`${styles.productCard} ${product.inventory === 0 ? styles.outOfStock : ''}`}
                onClick={() => addToCart(product)}
                disabled={product.inventory === 0}
              >
                <span className={styles.productName}>{product.name}</span>
                <span className={styles.productPrice}>${(product.price / 100).toFixed(2)}</span>
                {product.inventory != null && (
                  <span className={`${styles.productStock} ${product.inventory <= 3 ? styles.lowStock : ''}`}>
                    {product.inventory === 0 ? 'Out of stock' : `${product.inventory} left`}
                  </span>
                )}
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <p className={styles.emptyProducts}>No products in this category.</p>
            )}
          </div>
        </div>

        {/* Right — Cart */}
        <div className={styles.cartPanel}>
          {/* Member Search */}
          <div className={styles.memberSearch}>
            <input
              className={styles.memberInput}
              placeholder="Search member (optional)…"
              value={memberQuery}
              onChange={e => { setMemberQuery(e.target.value); setSelectedMember(null); }}
            />
            {selectedMember && (
              <div className={styles.selectedMember}>
                <span>👤 {selectedMember.firstName} {selectedMember.lastName}</span>
                <button onClick={() => { setSelectedMember(null); setMemberQuery(''); }}>✕</button>
              </div>
            )}
            {memberResults.length > 0 && !selectedMember && (
              <div className={styles.memberDropdown}>
                {memberResults.map(m => (
                  <button key={m.id} className={styles.memberOption}
                    onClick={() => { setSelectedMember(m); setMemberQuery(''); setMemberResults([]); }}>
                    {m.firstName} {m.lastName} — {m.email}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart Items */}
          <div className={styles.cartItems}>
            {cart.length === 0 ? (
              <p className={styles.emptyCart}>Tap a product to add it</p>
            ) : (
              cart.map(item => (
                <div key={item.product.id} className={styles.cartItem}>
                  <div className={styles.cartItemInfo}>
                    <span className={styles.cartItemName}>{item.product.name}</span>
                    <span className={styles.cartItemPrice}>${((item.product.price * item.quantity) / 100).toFixed(2)}</span>
                  </div>
                  <div className={styles.cartQty}>
                    <button onClick={() => updateQty(item.product.id, -1)}>−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, 1)}>+</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals */}
          {cart.length > 0 && (
            <div className={styles.cartTotals}>
              <div className={styles.totalRow}><span>Subtotal</span><span>${(subtotal / 100).toFixed(2)}</span></div>
              <div className={`${styles.totalRow} ${styles.grandTotal}`}><span>Total</span><span>${(total / 100).toFixed(2)}</span></div>
            </div>
          )}

          {/* Actions */}
          <div className={styles.cartActions}>
            <button className={styles.clearCartBtn} onClick={clearCart} disabled={cart.length === 0}>Clear</button>
            <button className={styles.checkoutBtn} onClick={() => setViewMode('checkout')} disabled={cart.length === 0}>
              Charge ${(total / 100).toFixed(2)}
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {viewMode === 'checkout' && (
        <div className={styles.checkoutOverlay}>
          <div className={styles.checkoutModal}>
            <div className={styles.checkoutHeader}>
              <h2>Checkout — ${(total / 100).toFixed(2)}</h2>
              <button className={styles.closeCheckout} onClick={() => setViewMode('pos')}>✕</button>
            </div>

            {/* Payment Method Tabs */}
            <div className={styles.paymentTabs}>
              {(['cash', 'card', 'terminal'] as PaymentMethod[]).map(m => (
                <button
                  key={m}
                  className={`${styles.paymentTab} ${paymentMethod === m ? styles.activePayTab : ''}`}
                  onClick={() => { setPaymentMethod(m); if (m === 'terminal') initTerminal(); }}
                >
                  {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '📟 Card Reader'}
                </button>
              ))}
            </div>

            {/* Cash */}
            {paymentMethod === 'cash' && (
              <div className={styles.cashSection}>
                <label className={styles.cashLabel}>Cash Received ($)</label>
                <input
                  className={styles.cashInput}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={cashReceived}
                  onChange={e => setCashReceived(e.target.value)}
                  autoFocus
                />
                {cashReceived && (
                  <div className={`${styles.changeDisplay} ${change < 0 ? styles.changeNeg : ''}`}>
                    {change < 0 ? `Short by $${(Math.abs(change) / 100).toFixed(2)}` : `Change: $${(change / 100).toFixed(2)}`}
                  </div>
                )}
                <button
                  className={styles.chargeBtn}
                  onClick={handleCashCheckout}
                  disabled={!cashReceived || change < 0}
                >
                  Complete Sale
                </button>
              </div>
            )}

            {/* Card (Stripe Elements) */}
            {paymentMethod === 'card' && (
              <div className={styles.cardSection}>
                {stripePromise ? (
                  <Elements stripe={stripePromise}>
                    <CardPaymentForm
                      total={total}
                      locationId={locationId!}
                      onSuccess={handleCardSuccess}
                      onCancel={() => setViewMode('pos')}
                    />
                  </Elements>
                ) : (
                  <p className={styles.noStripe}>Stripe is not configured. Add your publishable key in Settings → Stripe Payments.</p>
                )}
              </div>
            )}

            {/* Terminal */}
            {paymentMethod === 'terminal' && (
              <div className={styles.terminalSection}>
                {terminalStatus === 'idle' && readers.length > 0 && (
                  <>
                    <p className={styles.terminalHint}>Select a reader to connect:</p>
                    {readers.map((r: any) => (
                      <button key={r.id} className={styles.readerBtn} onClick={() => connectReader(r)}>
                        {r.label || r.id} <span className={styles.readerStatus}>●</span>
                      </button>
                    ))}
                  </>
                )}
                {terminalStatus === 'connecting' && <div className={styles.terminalWaiting}>Connecting…</div>}
                {terminalStatus === 'connected' && (
                  <>
                    <div className={styles.readerConnected}>
                      ✓ {connectedReader?.label || 'Reader'} connected
                    </div>
                    <button className={styles.chargeBtn} onClick={collectTerminalPayment}>
                      Charge ${(total / 100).toFixed(2)} on Reader
                    </button>
                  </>
                )}
                {terminalStatus === 'collecting' && (
                  <div className={styles.terminalWaiting}>Waiting for card…<br /><small>Present or tap card on reader</small></div>
                )}
                {terminalStatus === 'processing' && <div className={styles.terminalWaiting}>Processing payment…</div>}
                {terminalStatus === 'error' && (
                  <>
                    <div className={styles.terminalError}>{terminalError}</div>
                    <button className={styles.retryBtn} onClick={initTerminal}>Retry</button>
                  </>
                )}
                {(terminalStatus === 'idle' && readers.length === 0) && (
                  <button className={styles.chargeBtn} onClick={initTerminal}>Search for Readers</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default POS;
