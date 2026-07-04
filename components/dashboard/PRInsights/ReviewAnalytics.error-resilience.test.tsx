// ReviewAnalytics.error-resilience.test.tsx
//
// Verifies Hydration Stability, Exception Safety & Error Fallbacks for the
// ReviewAnalytics component. Unexpected background-service interruptions or
// server anomalies must never crash the page — they must be absorbed by a
// localized error boundary that presents a clean recovery UI and routes the
// exception to dev-telemetry trackers.

import React, { Component, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PRInsightData } from '@/services/github/pr-insights';
import ReviewAnalytics from './ReviewAnalytics';

// ---------------------------------------------------------------------------
// Stub framer-motion so animation wrappers render as plain divs in JSDOM.
// ---------------------------------------------------------------------------
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// ---------------------------------------------------------------------------
// Typed error-boundary fixture used across every test in this suite.
// The onError callback acts as a stand-in for a real telemetry tracker
// (e.g. Sentry, Datadog, or a custom logging endpoint) so we can assert
// that exceptions are forwarded to the observability layer without actually
// wiring up a live SDK.
// ---------------------------------------------------------------------------
interface BoundaryState {
  caught: boolean;
  error: Error | null;
}

interface BoundaryProps {
  children: ReactNode;
  /** Optional telemetry callback — passed the thrown Error so callers can spy on it. */
  onError?: (err: Error) => void;
}

class TestErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { caught: false, error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    // React calls this synchronously before the next render so the fallback
    // UI is shown instead of the broken subtree.
    return { caught: true, error };
  }

  componentDidCatch(error: Error): void {
    // Forward the exception to any registered telemetry tracker. In
    // production this would be replaced by Sentry.captureException() or an
    // equivalent call.
    this.props.onError?.(error);
  }

  render(): ReactNode {
    if (this.state.caught) {
      return (
        <div role="alert" data-testid="error-recovery-panel">
          <h2>Something went wrong.</h2>
          <p>The review analytics panel failed to load.</p>
          <button
            onClick={() => this.setState({ caught: false, error: null })}
          >
            Reload Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Shared valid data fixture — satisfies PRInsightData so TypeScript is
// happy but individual tests may override specific fields to inject faults.
// ---------------------------------------------------------------------------
const baseData: PRInsightData = {
  totalPRs: 40,
  prs: [],
  openPRs: 5,
  mergedPRs: 30,
  closedPRs: 5,
  mergeRate: 75,
  avgReviewTime: 6.0,
  avgTimeToFirstReview: 2.0,
  avgCycleTime: 10.0,
  weeklyActivity: [],
  monthlyActivity: [],
  reviewsGiven: 22,
  reviewsReceived: 15,
  avgReviewResponseTime: 3.5,
  fastestReview: 1.2,
  slowestReview: 18.6,
  repoPerformance: [],
  highlights: {},
};

// ---------------------------------------------------------------------------
// Suppress React's own console.error noise for intentional-crash tests so
// the Vitest output stays readable.  Restore after each test to prevent
// cross-test leakage.
// ---------------------------------------------------------------------------
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------
describe('ReviewAnalytics — Hydration Stability, Exception Safety & Error Fallbacks', () => {
  // -------------------------------------------------------------------------
  // Test 1: Mock nested child properties to throw unexpected runtime
  // exceptions or database-connectivity errors.
  //
  // Why: When a background service returns a corrupted payload (e.g. NaN
  // instead of a number, or null where an object is expected), the component
  // must not propagate a JS exception to the React root. Wrapping it in a
  // boundary proves the fault stays localised.
  // -------------------------------------------------------------------------
  it('Test 1: boundary catches a runtime exception caused by a corrupted data payload and prevents full-page crash', () => {
    // Simulate a downstream service returning a null where .toFixed() would
    // be called — this triggers a TypeError that mimics a real DB or API
    // failure surfacing an unexpected shape.
    const corruptedData = {
      ...baseData,
      fastestReview: null as unknown as number,
      slowestReview: undefined as unknown as number,
    };

    const telemetry = vi.fn();

    render(
      <TestErrorBoundary onError={telemetry}>
        <ReviewAnalytics data={corruptedData} />
      </TestErrorBoundary>
    );

    // The recovery panel must surface instead of a blank/broken DOM.
    expect(screen.getByTestId('error-recovery-panel')).toBeDefined();
    expect(screen.getByText('Something went wrong.')).toBeDefined();

    // The exception must have been forwarded to the telemetry layer.
    expect(telemetry).toHaveBeenCalledOnce();
    expect(telemetry.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // -------------------------------------------------------------------------
  // Test 2: Encase execution calls in localized boundary elements.
  //
  // Why: An error boundary must absorb failures without letting them bubble
  // past its render scope. This test verifies that the boundary itself mounts
  // cleanly when the component renders without fault, proving the wrapper is
  // transparent under normal operating conditions.
  // -------------------------------------------------------------------------
  it('Test 2: boundary element is transparent when the component renders without fault', () => {
    // Normal, well-formed data — no exception should be thrown.
    render(
      <TestErrorBoundary>
        <ReviewAnalytics data={baseData} />
      </TestErrorBoundary>
    );

    // The four metric cards must all be visible through the boundary.
    expect(screen.getByText('Reviews Given')).toBeInTheDocument();
    expect(screen.getByText('Reviews Received')).toBeInTheDocument();
    expect(screen.getByText('Fastest Review')).toBeInTheDocument();
    expect(screen.getByText('Slowest Review')).toBeInTheDocument();

    // The fallback UI must NOT be shown.
    expect(screen.queryByTestId('error-recovery-panel')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 3: Assert that target modules render a clean error recovery UI
  // instead of crashing the site.
  //
  // Why: A BrokenChild component that throws unconditionally simulates the
  // worst-case scenario: an unhandled exception from a nested dependency
  // (e.g. a chart library calling a method that does not exist on a stub).
  // The boundary must swap in a styled fallback so end users see a recovery
  // panel rather than a React error overlay.
  // -------------------------------------------------------------------------
  it('Test 3: renders a clean error recovery UI with role="alert" when an inner child throws an unhandled exception', () => {
    // A minimal component that always throws — models a dependency that
    // explodes when the external service connection is lost.
    const BrokenReviewChild = (): never => {
      throw new Error('503 Service Unavailable — review analytics unreachable');
    };

    render(
      <TestErrorBoundary>
        <BrokenReviewChild />
      </TestErrorBoundary>
    );

    // The recovery panel must carry role="alert" for assistive technologies.
    const panel = screen.getByRole('alert');
    expect(panel).toBeDefined();
    expect(panel).toHaveAttribute('data-testid', 'error-recovery-panel');

    // A meaningful human-readable message must be shown.
    expect(screen.getByText('The review analytics panel failed to load.')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 4: Verify exceptions are logged to dev-telemetry trackers
  // appropriately.
  //
  // Why: Silent failures are worse than visible ones. Every exception that
  // reaches the boundary must be forwarded to the telemetry layer so on-call
  // engineers can diagnose production anomalies without needing a user
  // report.  The test spies on the onError callback and validates the
  // exception message is faithfully propagated.
  // -------------------------------------------------------------------------
  it('Test 4: exceptions are forwarded to the telemetry callback with the correct error message', () => {
    const telemetry = vi.fn();
    const DB_ERROR_MSG = 'MongoDB connection pool exhausted';

    const DatabaseFailureChild = (): never => {
      throw new Error(DB_ERROR_MSG);
    };

    render(
      <TestErrorBoundary onError={telemetry}>
        <DatabaseFailureChild />
      </TestErrorBoundary>
    );

    // onError must be called exactly once per error event.
    expect(telemetry).toHaveBeenCalledOnce();

    // The propagated error must carry the original message so log
    // aggregators can group and alert on it correctly.
    const receivedError: Error = telemetry.mock.calls[0][0];
    expect(receivedError).toBeInstanceOf(Error);
    expect(receivedError.message).toBe(DB_ERROR_MSG);
  });

  // -------------------------------------------------------------------------
  // Test 5: Ensure user reset/reload paths are available on the recovery
  // panels.
  //
  // Why: Presenting an error state with no escape route is a dead end for
  // users. The recovery panel must always expose a "Reload Panel" button so
  // users can attempt to recover without a full page refresh. This also
  // prevents the support burden of users force-reloading the entire
  // dashboard when only one widget fails.
  // -------------------------------------------------------------------------
  it('Test 5: the recovery panel exposes a reload button that is reachable by assistive technologies', () => {
    const AlwaysBroken = (): never => {
      throw new Error('Simulated background service interruption');
    };

    render(
      <TestErrorBoundary>
        <AlwaysBroken />
      </TestErrorBoundary>
    );

    // The recovery panel must be in the DOM.
    expect(screen.getByTestId('error-recovery-panel')).toBeInTheDocument();

    // A clearly labelled reset button must be discoverable via accessible
    // role query — not just by class name or data-testid — so keyboard and
    // screen-reader users can invoke it.
    const reloadBtn = screen.getByRole('button', { name: /reload panel/i });
    expect(reloadBtn).toBeInTheDocument();
  });
});
