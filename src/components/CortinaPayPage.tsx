import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Headphones,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
  WashingMachine,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useCortinaVend } from "../di/container";
import type { CortinaQuote, CortinaVendReference } from "../interfaces/CortinaVendService";
import icon from "../assets/Icon-web.png";
import logo from "../assets/Logo-web.png";
import laundromat from "../assets/laundromat-hero.jpg";
import "../styles/CortinaPay.css";

const TERMINAL_FAILURES = new Set(["failed", "refunded", "timed_out", "support_required", "voided"]);

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function CortinaPayPage() {
  const service = useCortinaVend();
  const [params] = useSearchParams();
  const machineToken = params.get("machine") ?? undefined;
  const uniQr = params.get("uniqr") ?? undefined;
  const returningReference = useMemo<CortinaVendReference | null>(() => {
    const sessionId = params.get("session");
    const accessToken = params.get("access");
    return sessionId && accessToken ? { sessionId, accessToken } : null;
  }, [params]);
  const [quote, setQuote] = useState<CortinaQuote | null>(null);
  const [amountCents, setAmountCents] = useState(150);
  const [signedIn, setSignedIn] = useState(false);
  const [isWasherVend, setIsWasherVend] = useState<boolean | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "paying" | "pending" | "started" | "refunded" | "failed">("loading");
  const [message, setMessage] = useState("");
  const cardRequestId = useRef<string | null>(null);
  const walletRequestId = useRef<string | null>(null);

  const pollVend = useCallback(async (reference: CortinaVendReference, isCancelled = () => false) => {
    setState("pending");
    for (let attempt = 0; attempt < 35 && !isCancelled(); attempt += 1) {
      const vend = await service.status(reference);
      setIsWasherVend(vend.dryer_minutes == null);
      if (vend.status === "started") {
        setState("started");
        return;
      }
      if (vend.status === "refunded") {
        setState("refunded");
        return;
      }
      if (TERMINAL_FAILURES.has(vend.status)) {
        setMessage(vend.failure_message ?? "The machine could not be started. Your payment will be returned when required.");
        setState("failed");
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    if (!isCancelled()) {
      setMessage("The payment was received, but the machine is still responding. Keep this page open or contact the location for help.");
      setState("pending");
    }
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setSignedIn(await service.hasSession());
        if (returningReference) {
          await pollVend(returningReference, () => cancelled);
          return;
        }
        if (!machineToken && !uniQr) throw new Error("This QR code does not identify a machine.");
        const nextQuote = await service.quote(machineToken, uniQr);
        if (cancelled) return;
        setQuote(nextQuote);
        setAmountCents(nextQuote.dryer?.defaultCents ?? nextQuote.amountCents);
        setState("ready");
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load this machine.");
          setState("failed");
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [machineToken, pollVend, returningReference, service, uniQr]);

  const payByCard = async () => {
    try {
      setState("paying");
      cardRequestId.current ??= crypto.randomUUID();
      const checkout = await service.createCard(machineToken, uniQr, amountCents, cardRequestId.current);
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Card payment could not be started.");
      setState("failed");
    }
  };

  const payByWallet = async () => {
    try {
      setState("paying");
      walletRequestId.current ??= crypto.randomUUID();
      const reference = await service.payWithWallet(machineToken, uniQr, amountCents, walletRequestId.current);
      await pollVend(reference);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet payment could not be completed.");
      setState("failed");
    }
  };

  const selectedDryerOption = quote?.dryer?.options.find(
    (option) => option.amountCents === amountCents,
  );

  return (
    <main className="cortina-pay-shell">
      <header className="cortina-pay-header">
        <a className="cortina-pay-brand" href="/" aria-label="Clean Stream Laundry home">
          <img src={icon} alt="" />
          <span><strong>Clean Stream</strong><small>Laundry Solutions</small></span>
        </a>
        <div className="cortina-header-trust"><ShieldCheck /><span>Secure machine payment</span></div>
      </header>
      <div className="cortina-pay-stage">
        <aside className="cortina-brand-scene" style={{ backgroundImage: `url(${laundromat})` }} aria-label="Clean Stream laundromat">
          <div className="cortina-scene-brand"><img src={logo} alt="Clean Stream Laundry Solutions" /></div>
        </aside>
        <section className="cortina-pay-panel" aria-live="polite" aria-busy={state === "loading" || state === "paying"}>
          {state === "loading" && <div className="cortina-state"><span className="cortina-state-icon"><LoaderCircle className="spin" /></span><p className="cortina-eyebrow">One moment</p><h1>Finding your machine</h1><p>We’re confirming the machine and its current price.</p></div>}
          {state === "paying" && <div className="cortina-state"><span className="cortina-state-icon"><LoaderCircle className="spin" /></span><p className="cortina-eyebrow">Payment in progress</p><h1>Opening secure checkout</h1><p>Keep this page open while Stripe prepares your payment.</p></div>}
          {state === "pending" && <div className="cortina-state"><span className="cortina-state-icon"><Clock3 /></span><p className="cortina-eyebrow">Payment received</p><h1>Starting your machine</h1><p>{message || "Waiting for the machine to confirm. This normally takes only a moment."}</p><div className="cortina-progress-pulse"><i /><span>Connecting securely</span></div></div>}
          {state === "started" && <div className="cortina-state success"><span className="cortina-state-icon"><CheckCircle2 /></span><p className="cortina-eyebrow">You’re all set</p><h1>Machine started</h1><p>{(quote ? quote.machineType === "washer" : isWasherVend) ? "Select your wash cycle on the machine." : "Your purchased time has been added."}</p><a className="cortina-state-action" href="/">Done<Check /></a></div>}
          {state === "refunded" && <div className="cortina-state"><span className="cortina-state-icon"><CheckCircle2 /></span><p className="cortina-eyebrow">Machine did not start</p><h1>Refund initiated</h1><p>A payment return has been initiated to your original payment method. Card refunds may take time to appear at your bank.</p><div className="cortina-state-links"><Link to="/support">Contact support</Link><a href="/">Done</a></div></div>}
          {state === "failed" && <div className="cortina-state failed"><span className="cortina-state-icon"><WashingMachine /></span><p className="cortina-eyebrow">We couldn’t finish</p><h1>Unable to continue</h1><p>{message}</p><div className="cortina-state-links"><button type="button" onClick={() => window.location.reload()}>Try again</button><Link to="/support">Contact support</Link></div></div>}
          {state === "ready" && quote && (
            <>
              <div className="cortina-checkout-intro">
                <div><p className="cortina-eyebrow">Machine payment</p><h1>Review and pay</h1></div>
                <ShieldCheck aria-label="Verified Clean Stream machine" />
              </div>
              <ol className="cortina-steps" aria-label="Payment progress">
                <li className="complete"><span><Check /></span>Scan</li>
                <li className="active"><span>2</span>Pay</li>
                <li><span>3</span>Start</li>
              </ol>
              <div className="cortina-machine-summary">
                <div className="cortina-machine-icon"><WashingMachine /></div>
                <div className="cortina-machine-copy">
                  <span>{quote.machineType === "washer" ? quote.washerSizeLabel ?? "Washer" : `${selectedDryerOption?.minutes ?? ""} minute dry`}</span>
                  <h2>{quote.machineName}</h2>
                </div>
                <div className="cortina-machine-total"><span>Total</span><strong>{money(amountCents)}</strong></div>
              </div>
              {quote.dryer ? (
                <div className="dryer-price-control">
                  <div className="cortina-section-heading"><div><span>Drying time</span><strong>{selectedDryerOption?.minutes} minutes</strong></div><small>$0.25 per 5 minutes</small></div>
                  <div className="dryer-option-grid" role="group" aria-label="Dryer time">
                    {quote.dryer.options.map((option) => (
                      <button
                        key={option.minutes}
                        type="button"
                        aria-pressed={option.amountCents === amountCents}
                        className={option.amountCents === amountCents ? "selected" : ""}
                        onClick={() => {
                          cardRequestId.current = null;
                          walletRequestId.current = null;
                          setAmountCents(option.amountCents);
                        }}
                      >
                        <span>{option.minutes} min</span>
                        <strong>{money(option.amountCents)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="washer-cycle-note"><span><SlidersHorizontal /></span><div><strong>Choose your cycle at the washer</strong><p>Choose temperature and cycle settings on the washer after it starts.</p></div></div>
              )}
              <div className="cortina-payment-section">
                <div className="cortina-section-heading"><div><span>Payment method</span><strong>How would you like to pay?</strong></div></div>
                <button className="cortina-card-payment" onClick={payByCard}>
                  <span className="cortina-payment-icon"><CreditCard /></span>
                  <span><strong>Credit or debit card</strong><small>Secure checkout powered by Stripe</small></span>
                  <span className="cortina-pay-amount">Pay {money(amountCents)}<ArrowRight /></span>
                </button>
                {signedIn && <button className="cortina-wallet-payment" aria-label="Use Clean Stream wallet" onClick={payByWallet}><span className="cortina-payment-icon"><WalletCards /></span><span><strong>Clean Stream wallet</strong><small>Use your available loyalty balance</small></span><ArrowRight /></button>}
              </div>
              {!signedIn && <div className="loyalty-note"><WalletCards /><div><strong>Clean Stream Loyalty member?</strong><p>Open this QR in the app to use your wallet and rewards.</p></div></div>}
              <div className="cortina-secure-note"><LockKeyhole /><span>Your payment details are encrypted and handled securely by Stripe.</span></div>
            </>
          )}
        </section>
      </div>
      <footer className="cortina-pay-footer"><span>© 2026 Clean Stream Laundry Solutions</span><nav aria-label="Payment page links"><Link to="/support"><Headphones />Support</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></nav></footer>
    </main>
  );
}

export default CortinaPayPage;
