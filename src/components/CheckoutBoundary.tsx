import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

export default class CheckoutBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="public-site-shell">
        <main className="public-document">
          <p className="public-eyebrow">Clean Stream Laundry</p>
          <h1>Checkout unavailable</h1>
          <p className="public-document-lead">We could not open checkout. If you already submitted a payment, contact support before trying again.</p>
          <p><Link to="/support">Contact support</Link> or <Link to="/">Go home</Link>.</p>
        </main>
      </div>
    );
  }
}
