"use client";

import * as React from "react";

/**
 * Catches a part that fails to load on demand (its chunk gone after a deploy, its labels
 * unreachable): it renders `fallback` and calls `onFailed`, instead of reaching the page's error
 * screen.
 */
export class LoadFailureBoundary extends React.Component<
  { onFailed?: () => void; fallback?: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailed?.();
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
