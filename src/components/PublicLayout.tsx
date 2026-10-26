import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import icon from "../assets/Icon-web.png";
import "../styles/PublicSite.css";

function PublicLayout() {
  const { pathname, hash, key } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname && !hash) {
      document.getElementById("public-content")?.focus({ preventScroll: true });
    }
    previousPathname.current = pathname;
  }, [pathname, hash]);

  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash]);

  useEffect(() => {
    if (!hash) return;

    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [pathname, hash, key]);

  return (
    <div className="public-site-shell">
      <a className="public-skip-link" href="#public-content">Skip to content</a>
      <header className="public-header">
        <Link className="public-brand" to="/" aria-label="Clean Stream Laundry home">
          <img src={icon} alt="" />
          <span>Clean Stream Laundry</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link to="/#services">Services</Link>
          <Link to="/#locations">Locations</Link>
          <Link className="public-support-link" to="/support">Support</Link>
        </nav>
      </header>

      <div id="public-content" tabIndex={-1}>
        <Outlet />
      </div>

      <footer className="public-footer">
        <div className="public-footer-main">
          <div>
            <Link className="public-brand public-footer-brand" to="/">
              <img src={icon} alt="" />
              <span>Clean Stream Laundry</span>
            </Link>
            <p>Simple payments, dependable machines, and a cleaner laundry day.</p>
          </div>
          <div>
            <strong>Get in touch</strong>
            <a href="tel:+17656102114"><Phone /> (765) 610-2114</a>
            <a href="mailto:support@cleanstreamlaundry.com"><Mail /> support@cleanstreamlaundry.com</a>
          </div>
          <div>
            <strong>Company</strong>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/account-deletion">Delete account</Link>
          </div>
        </div>
        <div className="public-footer-bottom">
          <span>Clean Stream Laundry Solutions LLC</span>
          <span>&copy; {new Date().getFullYear()} Clean Stream Laundry</span>
        </div>
      </footer>
    </div>
  );
}

export default PublicLayout;
