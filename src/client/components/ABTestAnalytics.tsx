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

interface AnalyticsData {
  summary: VariantAnalytics[];
  timeSeries: any[];
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
  const winner = calculateWinner();

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
            <span className={styles.compactLabel}>Leads:</span>
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
            Variant {winner} is winning
          </div>
        )}
      </div>

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
              <div className={styles.metricLabel}>Leads</div>
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
              <div className={styles.metricLabel}>Leads</div>
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
