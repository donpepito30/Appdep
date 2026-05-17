import { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorFallback } from './ErrorFallback';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error.message, errorInfo?.componentStack);
  }

  resetError = (): void => this.setState({ hasError: false, error: null });

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return <ErrorFallback error={this.state.error} resetErrorBoundary={this.resetError} />;
    }
    return this.props.children;
  }
}
