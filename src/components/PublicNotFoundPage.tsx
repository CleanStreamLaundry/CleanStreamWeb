import { Link } from "react-router-dom";

function PublicNotFoundPage() {
  return (
    <main className="public-document">
      <p className="public-eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="public-document-lead">The page you requested could not be found.</p>
      <p><Link to="/">Go home</Link> or <Link to="/support">Contact support</Link>.</p>
    </main>
  );
}

export default PublicNotFoundPage;
