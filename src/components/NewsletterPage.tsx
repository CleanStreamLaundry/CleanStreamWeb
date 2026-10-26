import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MailCheck, MailX } from "lucide-react";

type EmailLink = { action: "confirm" | "unsubscribe"; token: string };

function readLink(hash: string): EmailLink | null {
  if (hash.length > 160) return null;
  const values = new URLSearchParams(hash.slice(1));
  const action = values.get("action");
  const token = values.get("token");
  if (
    values.size !== 2 ||
    values.getAll("action").length !== 1 ||
    values.getAll("token").length !== 1 ||
    (action !== "confirm" && action !== "unsubscribe") ||
    !token || !/^[0-9a-f]{64}$/.test(token)
  ) return null;
  return { action, token };
}

function NewsletterAction({ hash, pathname }: { hash: string; pathname: string }) {
  const [link] = useState(() => readLink(hash));
  const [state, setState] = useState<"ready" | "sending" | "done" | "error">("ready");
  const request = useRef<AbortController | null>(null);
  const attempted = useRef(false);
  const confirming = link?.action === "confirm";

  useEffect(() => {
    if (window.location.pathname === pathname && window.location.hash === hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [hash, pathname]);

  async function submit() {
    if (!link || attempted.current) return;
    attempted.current = true;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    controller.signal.addEventListener("abort", () => window.clearTimeout(timeout), { once: true });
    setState("sending");
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_ANON_KEY;
      if (!base || !key) throw new Error("Newsletter unavailable");
      // Capability links must not refresh or depend on a stored Auth session.
      const response = await fetch(new URL("/functions/v1/newsletter", base), {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify(link),
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      const expected = confirming ? "subscribed" : "unsubscribed";
      if (!response.ok || !result || typeof result !== "object" ||
        !("state" in result) || result.state !== expected) {
        throw new Error("Newsletter result not confirmed");
      }
      if (!controller.signal.aborted) setState("done");
    } catch {
      if (request.current === controller) setState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <main className="public-document public-newsletter">
      <p className="public-eyebrow">Clean Stream email</p>
      <h1>Newsletter preferences</h1>
      <div aria-live="polite">
        {!link ? (
          <p className="public-document-lead">This link is incomplete or invalid. You can manage newsletter preferences in the Clean Stream app.</p>
        ) : state === "done" ? (
          <p className="public-document-lead">
            {confirming ? "Your newsletter subscription is confirmed." : "You are unsubscribed from the newsletter. Necessary account and payment emails are separate."}
          </p>
        ) : state === "error" ? (
          <p className="public-document-lead" role="alert">
            We could not confirm the result. The link may have expired or already been used. Check your newsletter preferences in the app or contact support before trying again.
          </p>
        ) : (
          <>
            <p className="public-document-lead">
              {confirming ? "Confirm your request to receive the Clean Stream newsletter. You can unsubscribe at any time." : "Unsubscribe from the Clean Stream newsletter. This will not delete your account."}
            </p>
            <button className="public-button" aria-busy={state === "sending"} disabled={state === "sending"} onClick={() => void submit()}>
              {confirming ? <MailCheck aria-hidden="true" /> : <MailX aria-hidden="true" />}
              {confirming ? "Confirm subscription" : "Unsubscribe"}
            </button>
            {state === "sending" && <p role="status">Confirming...</p>}
          </>
        )}
      </div>
      <p className="public-newsletter-support"><Link to="/support">Contact support</Link></p>
    </main>
  );
}

export default function NewsletterPage() {
  const location = useLocation();
  return <NewsletterAction key={`${location.key}:${location.hash}`} hash={location.hash} pathname={location.pathname} />;
}
