import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import styles from './ABTestAnalytics.module.css';

interface VariantAnalytics {
  variant: 'A' | 'B';
  views: number;
  clicks: number;
  leads: number;
  bounces: number;
  uniqueVisitors: number;
  avgEngagementTime: number;
  ctr: string;
  conversionRate: string;
  bounceRate: string;
}

interface Significance {
  status: 'insufficient_data' | 'not_significant' | 'significant';
  confidence: number;
  pValue: number;
  significanceLevel: 90 | 95 | 99 | null;
  threshold: 90 | 95 | 99;
  winner: 'A' | 'B' | null;
  controlRate: number;
  treatmentRate: number;
  relativeLift: number;
  sample: { a: number; b: number };
  conversions: { a: number; b: number };
  recommendation: string;
  projection: { visitorsNeeded: number; daysRemaining: number | null } | null;
  dataGate: {
    viewsNeededA: number;
    viewsNeededB: number;
    conversionsNeeded: number;
    daysRemaining: number | null;
    thresholds: { minViewsPerArm: number; minTotalConversions: number };
  } | null;
}

interface AnalyticsData {
  summary: VariantAnalytics[];
  timeSeries: any[];
  significance?: Significance | null;
}

interface ABTestAnalyticsProps {
  testId: number;
  testName: string;
  compact?: boolean;
}

const ABTestAnalytics: React.FC<ABTestAnalyticsProps> = ({ testId, testName, compact = false }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [testId]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const data = await api.get(`/ab-analytics/${testId}`);
      setAnalytics(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getVariantData = (variant: 'A' | 'B'): VariantAnalytics | null => {
    return analytics?.summary.find(v => v.variant === variant) || null;
  };

  const calculateWinner = (): 'A' | 'B' | null => {
    if (!analytics?.summary || analytics.summary.length < 2) return null;

    const variantA = getVariantData('A');
    const variantB = getVariantData('B');

    if (!variantA || !variantB) return null;

    // Winner based on conversion rate
    const convA = parseFloat(variantA.conversionRate);
    const convB = parseFloat(variantB.conversionRate);

    if (convA > convB) return 'A';
    if (convB > convA) return 'B';
    return null;
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading analytics...</div>;
  }

  if (error) {
    return <div className={styles.error}>Failed to load analytics: {error}</div>;
  }

  if (!analytics || analytics.summary.length === 0) {
    return (
      <div className={styles.noData}>
        <p>No analytics data available yet.</p>
        <p className={styles.hint}>Once your test is running and receiving traffic, analytics will appear here.</p>
      </div>
    );
  }

  const variantA = getVariantData('A');
  const variantB = getVariantData('B');
  const sig = analytics.significance || null;
  // Prefer the statistically-sound winner; fall back to the raw-rate compare.
  const winner = sig?.status === 'significant' ? sig.winner : calculateWinner();

  const renderSignificance = () => {
    if (!sig) return null;
    const cls =
      sig.status === 'significant' ? styles.sigSignificant :
      sig.status === 'not_significant' ? styles.sigPending : styles.sigCollecting;
    const heading =
      sig.status === 'significant'
        ? `Statistically significant — ${sig.confidence}% confidence${sig.significanceLevel === 99 ? ' (99% milestone)' : ''}`
        : sig.status === 'not_significant'
          ? `Not significant yet — ${sig.confidence}% confidence (need ${sig.threshold}%)`
          : 'Collecting data';
    return (
      <div className={`${styles.sigBanner} ${cls}`}>
        <div className={styles.sigHead}>
          <span className={styles.sigDot} />
          <strong>{heading}</strong>
        </div>
        <p className={styles.sigRec}>{sig.recommendation}</p>
        <div className={styles.sigStats}>
          <span>A: {sig.controlRate.toFixed(2)}% ({sig.conversions.a}/{sig.sample.a})</span>
          <span>B: {sig.treatmentRate.toFixed(2)}% ({sig.conversions.b}/{sig.sample.b})</span>
          {sig.status !== 'insufficient_data' && (
            <span>Lift: {sig.relativeLift > 0 ? '+' : ''}{sig.relativeLift}%</span>
          )}
        </div>
        {sig.dataGate && (
          <p className={styles.sigProjection}>
            Needs {[
              sig.dataGate.viewsNeededA > 0 ? `${sig.dataGate.viewsNeededA} more visitor${sig.dataGate.viewsNeededA === 1 ? '' : 's'} on A` : null,
              sig.dataGate.viewsNeededB > 0 ? `${sig.dataGate.viewsNeededB} more visitor${sig.dataGate.viewsNeededB === 1 ? '' : 's'} on B` : null,
              sig.dataGate.conversionsNeeded > 0 ? `${sig.dataGate.conversionsNeeded} more conversion${sig.dataGate.conversionsNeeded === 1 ? '' : 's'}` : null,
            ].filter(Boolean).join(', ')} before a verdict is possible
            {sig.dataGate.daysRemaining != null ? ` (~${sig.dataGate.daysRemaining} day${sig.dataGate.daysRemaining === 1 ? '' : 's'} at current traffic)` : ''}.
          </p>
        )}
        {sig.projection && (
          <p className={styles.sigProjection}>
            Prediction: ~{sig.projection.visitorsNeeded.toLocaleString()} more visitors
            {sig.projection.daysRemaining != null ? ` (~${sig.projection.daysRemaining} day${sig.projection.daysRemaining === 1 ? '' : 's'} at current traffic)` : ''} to reach {sig.threshold}% for the current gap.
          </p>
        )}
      </div>
    );
  };

  if (compact) {
    // Compact view for cards
    return (
      <div className={styles.compactAnalytics}>
        <div className={styles.compactMetrics}>
          <div className={styles.compactMetric}>
            <span className={styles.compactLabel}>Views:</span>
            <span className={styles.compactValue}>
              {(variantA?.views || 0) + (variantB?.views || 0)}
            </span>
          </div>
          <div className={styles.compactMetric}>
            <span className={styles.compactLabel}>Conversions:</span>
            <span className={styles.compactValue}>
              {(variantA?.leads || 0) + (variantB?.leads || 0)}
            </span>
          </div>
          <div className={styles.compactMetric}>
            <span className={styles.compactLabel}>CTR:</span>
            <span className={styles.compactValue}>
              {variantA && variantB
                ? (
                    ((variantA.clicks + variantB.clicks) /
                      (variantA.views + variantB.views)) *
                    100
                  ).toFixed(2)
                : '0.00'}
              %
            </span>
          </div>
        </div>
        {sig && sig.status !== 'insufficient_data' && (
          <div className={`${styles.compactSig} ${sig.status === 'significant' ? styles.sigSignificant : styles.sigPending}`}>
            {sig.status === 'significant'
              ? `Significant · ${sig.confidence}% · ${sig.winner} wins`
              : `${sig.confidence}% confidence`}
          </div>
        )}
      </div>
    );
  }

  // Full analytics view
  return (
    <div className={styles.analytics}>
      <div className={styles.header}>
        <h3 className={styles.title}>Analytics Dashboard</h3>
        {winner && (
          <div className={styles.winnerBadge}>
            {sig?.status === 'significant' ? `Variant ${winner} wins` : `Variant ${winner} is ahead`}
          </div>
        )}
      </div>

      {renderSignificance()}

      <div className={styles.variantsComparison}>
        {/* Variant A */}
        <div className={`${styles.variantCard} ${winner === 'A' ? styles.winner : ''}`}>
          <div className={styles.variantHeader}>
            <div className={styles.variantLetter}>A</div>
            <h4 className={styles.variantTitle}>Variant A</h4>
          </div>

          <div className={styles.metricsGrid}>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Views</div>
              <div className={styles.metricValue}>{variantA?.views || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Clicks</div>
              <div className={styles.metricValue}>{variantA?.clicks || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Conversions</div>
              <div className={styles.metricValue}>{variantA?.leads || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Unique Visitors</div>
              <div className={styles.metricValue}>{variantA?.uniqueVisitors || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>CTR</div>
              <div className={styles.metricValue}>{variantA?.ctr || '0.00'}%</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Conversion Rate</div>
              <div className={styles.metricValue}>{variantA?.conversionRate || '0.00'}%</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Bounce Rate</div>
              <div className={styles.metricValue}>{variantA?.bounceRate || '0.00'}%</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Avg. Engagement</div>
              <div className={styles.metricValue}>
                {formatTime(Math.round(variantA?.avgEngagementTime || 0))}
              </div>
            </div>
          </div>
        </div>

        {/* Variant B */}
        <div className={`${styles.variantCard} ${winner === 'B' ? styles.winner : ''}`}>
          <div className={styles.variantHeader}>
            <div className={styles.variantLetter}>B</div>
            <h4 className={styles.variantTitle}>Variant B</h4>
          </div>

          <div className={styles.metricsGrid}>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Views</div>
              <div className={styles.metricValue}>{variantB?.views || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Clicks</div>
              <div className={styles.metricValue}>{variantB?.clicks || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Conversions</div>
              <div className={styles.metricValue}>{variantB?.leads || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Unique Visitors</div>
              <div className={styles.metricValue}>{variantB?.uniqueVisitors || 0}</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>CTR</div>
              <div className={styles.metricValue}>{variantB?.ctr || '0.00'}%</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Conversion Rate</div>
              <div className={styles.metricValue}>{variantB?.conversionRate || '0.00'}%</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Bounce Rate</div>
              <div className={styles.metricValue}>{variantB?.bounceRate || '0.00'}%</div>
            </div>

            <div className={styles.metric}>
              <div className={styles.metricLabel}>Avg. Engagement</div>
              <div className={styles.metricValue}>
                {formatTime(Math.round(variantB?.avgEngagementTime || 0))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Comparison */}
      {variantA && variantB && (
        <div className={styles.comparisonSection}>
          <h4 className={styles.comparisonTitle}>Performance Comparison</h4>

          <div className={styles.comparisonBars}>
            <div className={styles.comparisonMetric}>
              <div className={styles.comparisonLabel}>Conversion Rate</div>
              <div className={styles.barsContainer}>
                <div className={styles.bar}>
                  <div className={styles.barLabel}>A</div>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${Math.min(parseFloat(variantA.conversionRate) * 5, 100)}%`,
                    }}
                  >
                    <span className={styles.barValue}>{variantA.conversionRate}%</span>
                  </div>
                </div>
                <div className={styles.bar}>
                  <div className={styles.barLabel}>B</div>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${Math.min(parseFloat(variantB.conversionRate) * 5, 100)}%`,
                    }}
                  >
                    <span className={styles.barValue}>{variantB.conversionRate}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.comparisonMetric}>
              <div className={styles.comparisonLabel}>Click-Through Rate</div>
              <div className={styles.barsContainer}>
                <div className={styles.bar}>
                  <div className={styles.barLabel}>A</div>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${Math.min(parseFloat(variantA.ctr) * 2, 100)}%`,
                    }}
                  >
                    <span className={styles.barValue}>{variantA.ctr}%</span>
                  </div>
                </div>
                <div className={styles.bar}>
                  <div className={styles.barLabel}>B</div>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${Math.min(parseFloat(variantB.ctr) * 2, 100)}%`,
                    }}
                  >
                    <span className={styles.barValue}>{variantB.ctr}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ABTestAnalytics;
