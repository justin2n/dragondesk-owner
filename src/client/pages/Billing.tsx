import React, { useState, useEffect } from 'react';
import { useLocation } from '../contexts/LocationContext';
import { api } from '../utils/api';
import { CheckIcon, WarningIcon } from '../components/Icons';
import { useToast } from '../components/Toast';
import styles from './Billing.module.css';

interface Subscription {
  id: number;
  memberId: number;
  memberName: string;
  memberEmail: string;
  planName: string;
  planAmount: number;
  planInterval: string;
  status: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface Invoice {
  id: number;
  memberId: number;
  memberName: string;
  memberEmail: string;
  planName?: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  invoiceNumber?: string;
  paidAt?: string;
  createdAt: string;
}

interface BillingStats {
  paidThisMonth: number;
  outstanding: number;
  failedPaymentsCount: number;
}

const Billing = () => {
  const { toast, confirm } = useToast();
  const { selectedLocation, isAllLocations } = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<BillingStats>({ paidThisMonth: 0, outstanding: 0, failedPaymentsCount: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [selectedLocation, isAllLocations]);

  const loadData = async () => {
    setLoading(true);
    try {
      const locationParam = isAllLocations ? '' : `?locationId=${selectedLocation?.id}`;

      const [subsResponse, invoicesResponse, statsResponse] = await Promise.all([
        api.get(`/subscriptions${locationParam}`),
        api.get(`/invoices${locationParam}&limit=100`),
        api.get(`/invoices/stats${locationParam}`)
      ]);

      setSubscriptions(subsResponse || []);
      setInvoices(invoicesResponse || []);
      setStats(statsResponse || { paidThisMonth: 0, outstanding: 0, failedPaymentsCount: 0 });
    } catch (error) {
      console.error('Failed to load billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'paid':
        return styles.statusActive;
      case 'trialing':
        return styles.statusTrialing;
      case 'past_due':
      case 'open':
        return styles.statusPastDue;
      case 'canceled':
      case 'void':
        return styles.statusCanceled;
      default:
        return styles.statusDefault;
    }
  };

  const handleCancelSubscription = async (subscriptionId: number, immediately: boolean) => {
    const message = immediately
      ? 'Cancel immediately? The member will lose access right away.'
      : 'Cancel at end of billing period? The member will retain access until then.';

    if (!await confirm({ title: 'Cancel Subscription', message, confirmLabel: 'Cancel Subscription', danger: true })) return;

    try {
      await api.post(`/subscriptions/${subscriptionId}/cancel`, { immediately });
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to cancel subscription', 'error');
    }
  };

  const handleResumeSubscription = async (subscriptionId: number) => {
    try {
      await api.post(`/subscriptions/${subscriptionId}/resume`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to resume subscription', 'error');
    }
  };

  const handleRetryPayment = async (invoiceId: number) => {
    try {
      await api.post(`/invoices/${invoiceId}/pay`);
      loadData();
    } catch (error: any) {
      toast(error.message || 'Failed to retry payment', 'error');
    }
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    if (statusFilter === 'all') return true;
    return sub.status === statusFilter;
  });

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter === 'all') return true;
    return inv.status === statusFilter;
  });

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active' || s.status === 'trialing');
  const mrr = activeSubscriptions.reduce((sum, s) => {
    if (s.planInterval === 'month') return sum + (s.planAmount || 0);
    if (s.planInterval === 'year') return sum + ((s.planAmount || 0) / 12);
    if (s.planInterval === 'week') return sum + ((s.planAmount || 0) * 4.33);
    return sum;
  }, 0);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading billing data...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Billing</h1>
          <p className={styles.subtitle}>Manage subscriptions, invoices, and payments</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Monthly Recurring Revenue</div>
          <div className={styles.statValue}>{formatCurrency(mrr)}</div>
          <div className={styles.statSubtext}>{activeSubscriptions.length} active subscriptions</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Collected This Month</div>
          <div className={styles.statValue}>{formatCurrency(stats.paidThisMonth)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Outstanding</div>
          <div className={`${styles.statValue} ${stats.outstanding > 0 ? styles.warning : ''}`}>
            {formatCurrency(stats.outstanding)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Failed Payments</div>
          <div className={`${styles.statValue} ${stats.failedPaymentsCount > 0 ? styles.danger : ''}`}>
            {stats.failedPaymentsCount}
          </div>
          {stats.failedPaymentsCount > 0 && (
            <div className={styles.statSubtext}>Requires attention</div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'overview' ? styles.active : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'subscriptions' ? styles.active : ''}`}
          onClick={() => setActiveTab('subscriptions')}
        >
          Subscriptions ({subscriptions.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'invoices' ? styles.active : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          Invoices ({invoices.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'failed' ? styles.active : ''}`}
          onClick={() => setActiveTab('failed')}
        >
          Failed Payments {stats.failedPaymentsCount > 0 && <span className={styles.badge}>{stats.failedPaymentsCount}</span>}
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className={styles.overviewGrid}>
          <div className={styles.overviewSection}>
            <h3>Recent Subscriptions</h3>
            {subscriptions.slice(0, 5).map(sub => (
              <div key={sub.id} className={styles.overviewItem}>
                <div className={styles.overviewItemMain}>
                  <span className={styles.memberName}>{sub.memberName}</span>
                  <span className={styles.planInfo}>{sub.planName}</span>
                </div>
                <span className={`${styles.status} ${getStatusColor(sub.status)}`}>
                  {sub.status}
                </span>
              </div>
            ))}
            {subscriptions.length === 0 && (
              <p className={styles.emptyText}>No subscriptions yet</p>
            )}
          </div>

          <div className={styles.overviewSection}>
            <h3>Recent Invoices</h3>
            {invoices.slice(0, 5).map(inv => (
              <div key={inv.id} className={styles.overviewItem}>
                <div className={styles.overviewItemMain}>
                  <span className={styles.memberName}>{inv.memberName}</span>
                  <span className={styles.planInfo}>{formatCurrency(inv.amountDue, inv.currency)}</span>
                </div>
                <span className={`${styles.status} ${getStatusColor(inv.status)}`}>
                  {inv.status}
                </span>
              </div>
            ))}
            {invoices.length === 0 && (
              <p className={styles.emptyText}>No invoices yet</p>
            )}
          </div>
        </div>
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <div className={styles.tableContainer}>
          <div className={styles.filterBar}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Next Billing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscriptions.map(sub => (
                <tr key={sub.id}>
                  <td>
                    <div className={styles.memberCell}>
                      <span className={styles.memberName}>{sub.memberName}</span>
                      <span className={styles.memberEmail}>{sub.memberEmail}</span>
                    </div>
                  </td>
                  <td>{sub.planName}</td>
                  <td>{formatCurrency(sub.planAmount)}/{sub.planInterval}</td>
                  <td>
                    <span className={`${styles.status} ${getStatusColor(sub.status)}`}>
                      {sub.status}
                      {sub.cancelAtPeriodEnd && ' (canceling)'}
                    </span>
                  </td>
                  <td>{sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '-'}</td>
                  <td>
                    <div className={styles.actions}>
                      {sub.cancelAtPeriodEnd ? (
                        <button
                          onClick={() => handleResumeSubscription(sub.id)}
                          className={styles.actionBtn}
                        >
                          Resume
                        </button>
                      ) : sub.status === 'active' || sub.status === 'trialing' ? (
                        <>
                          <button
                            onClick={() => handleCancelSubscription(sub.id, false)}
                            className={styles.actionBtn}
                          >
                            Cancel
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredSubscriptions.length === 0 && (
            <div className={styles.emptyState}>
              <p>No subscriptions found</p>
            </div>
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className={styles.tableContainer}>
          <div className={styles.filterBar}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="open">Open</option>
              <option value="draft">Draft</option>
              <option value="void">Void</option>
            </select>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Member</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNumber || `INV-${inv.id}`}</td>
                  <td>
                    <div className={styles.memberCell}>
                      <span className={styles.memberName}>{inv.memberName}</span>
                      <span className={styles.memberEmail}>{inv.memberEmail}</span>
                    </div>
                  </td>
                  <td>{formatCurrency(inv.amountDue, inv.currency)}</td>
                  <td>
                    <span className={`${styles.status} ${getStatusColor(inv.status)}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td>{formatDate(inv.createdAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      {inv.status === 'open' && (
                        <button
                          onClick={() => handleRetryPayment(inv.id)}
                          className={styles.actionBtn}
                        >
                          Retry Payment
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredInvoices.length === 0 && (
            <div className={styles.emptyState}>
              <p>No invoices found</p>
            </div>
          )}
        </div>
      )}

      {/* Failed Payments Tab */}
      {activeTab === 'failed' && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Member</th>
                <th>Amount</th>
                <th>Attempts</th>
                <th>Last Attempt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.filter(inv => inv.status === 'open').map(inv => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNumber || `INV-${inv.id}`}</td>
                  <td>
                    <div className={styles.memberCell}>
                      <span className={styles.memberName}>{inv.memberName}</span>
                      <span className={styles.memberEmail}>{inv.memberEmail}</span>
                    </div>
                  </td>
                  <td>{formatCurrency(inv.amountDue, inv.currency)}</td>
                  <td>-</td>
                  <td>{formatDate(inv.createdAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        onClick={() => handleRetryPayment(inv.id)}
                        className={`${styles.actionBtn} ${styles.primaryBtn}`}
                      >
                        Retry Payment
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {invoices.filter(inv => inv.status === 'open').length === 0 && (
            <div className={styles.emptyState}>
              <CheckIcon size={48} />
              <p>No failed payments!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Billing;
