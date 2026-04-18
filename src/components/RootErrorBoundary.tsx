"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };

type State = { hasError: boolean };

/**
 * Catches client render errors so a blank / crashed WebKit view can recover with a reload affordance.
 */
export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("RootErrorBoundary", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 py-12 text-center">
          <p className="font-heading text-lg font-semibold">
            Something went wrong loading this page.
          </p>
          <p className="text-muted-foreground text-sm max-w-sm">
            Try refreshing. If you opened this link inside another app, open it in
            Safari or Chrome for the best experience.
          </p>
          <Button
            type="button"
            className="rounded-full"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
          >
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
