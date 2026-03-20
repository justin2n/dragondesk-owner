// A/B Test Analytics Tracker
// This script tracks user interactions with A/B test pages

interface TrackingConfig {
  testId: number;
  variant: 'A' | 'B';
  apiUrl?: string;
}

interface TrackingEvent {
  testId: number;
  variant: 'A' | 'B';
  eventType: 'view' | 'click' | 'lead' | 'engagement' | 'bounce';
  sessionId: string;
  metadata?: any;
}

class ABTestTracker {
  private config: TrackingConfig;
  private sessionId: string;
  private startTime: number;
  private hasTrackedView: boolean = false;
  private engagementInterval: any;
  private apiUrl: string;

  constructor(config: TrackingConfig) {
    this.config = config;
    this.sessionId = this.getOrCreateSessionId();
    this.startTime = Date.now();
    this.apiUrl = config.apiUrl || '/api/ab-analytics/track';

    this.init();
  }

  private init() {
    // Track page view
    this.trackView();

    // Track clicks on interactive elements
    this.setupClickTracking();

    // Track engagement time
    this.setupEngagementTracking();

    // Track bounces
    this.setupBounceTracking();

    // Track form submissions (leads)
    this.setupLeadTracking();
  }

  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem('ab_test_session');

    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('ab_test_session', sessionId);
    }

    return sessionId;
  }

  private async track(event: Omit<TrackingEvent, 'testId' | 'variant' | 'sessionId'>) {
    try {
      const trackingData: TrackingEvent = {
        testId: this.config.testId,
        variant: this.config.variant,
        sessionId: this.sessionId,
        ...event,
      };

      await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trackingData),
        // Don't wait for response to avoid blocking
        keepalive: true,
      });
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }

  private trackView() {
    if (!this.hasTrackedView) {
      this.track({ eventType: 'view' });
      this.hasTrackedView = true;
    }
  }

  private setupClickTracking() {
    // Track clicks on buttons and links
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Track clicks on buttons, links, and CTAs
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.classList.contains('cta') ||
        target.classList.contains('btn')
      ) {
        this.track({
          eventType: 'click',
          metadata: {
            element: target.tagName,
            text: target.textContent?.substring(0, 100),
            href: target instanceof HTMLAnchorElement ? target.href : null,
          },
        });
      }
    });
  }

  private setupEngagementTracking() {
    // Track engagement every 30 seconds
    this.engagementInterval = setInterval(() => {
      const duration = Math.floor((Date.now() - this.startTime) / 1000);

      // Only track if user is actively engaged (not idle)
      if (document.hasFocus()) {
        this.track({
          eventType: 'engagement',
          metadata: { duration },
        });
      }
    }, 30000); // Every 30 seconds

    // Track final engagement on page unload
    window.addEventListener('beforeunload', () => {
      const duration = Math.floor((Date.now() - this.startTime) / 1000);

      // Use sendBeacon for reliable tracking on page unload
      const trackingData: TrackingEvent = {
        testId: this.config.testId,
        variant: this.config.variant,
        sessionId: this.sessionId,
        eventType: 'engagement',
        metadata: { duration, final: true },
      };

      navigator.sendBeacon(
        this.apiUrl,
        JSON.stringify(trackingData)
      );
    });
  }

  private setupBounceTracking() {
    // Consider it a bounce if user leaves within 10 seconds
    setTimeout(() => {
      const duration = Math.floor((Date.now() - this.startTime) / 1000);

      // If still on page after 10 seconds, it's not a bounce
      if (duration < 10) {
        window.addEventListener('beforeunload', () => {
          this.track({
            eventType: 'bounce',
            metadata: { duration },
          });
        }, { once: true });
      }
    }, 10000);
  }

  private setupLeadTracking() {
    // Track form submissions as leads
    document.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;

      this.track({
        eventType: 'lead',
        metadata: {
          formId: form.id,
          formName: form.name,
          formAction: form.action,
        },
      });
    });
  }

  public trackCustomEvent(eventType: 'click' | 'lead', metadata?: any) {
    this.track({ eventType, metadata });
  }

  public destroy() {
    if (this.engagementInterval) {
      clearInterval(this.engagementInterval);
    }
  }
}

// Export function to initialize tracker
export function initABTestTracker(config: TrackingConfig): ABTestTracker {
  return new ABTestTracker(config);
}

// Export for inline script usage
if (typeof window !== 'undefined') {
  (window as any).ABTestTracker = ABTestTracker;
  (window as any).initABTestTracker = initABTestTracker;
}

export default ABTestTracker;
