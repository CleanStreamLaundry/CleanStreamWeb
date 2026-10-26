import "./styles/App.css";
import PublicLayout from "./components/PublicLayout";
import PublicHomePage from "./components/PublicHomePage";
import PublicLegalPage from "./components/PublicLegalPage";
import AccountDeletionPage from "./components/AccountDeletionPage";
import SupportPage from "./components/SupportPage";
import PublicNotFoundPage from "./components/PublicNotFoundPage";
import NewsletterPage from "./components/NewsletterPage";
import CheckoutBoundary from "./components/CheckoutBoundary";

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
const CortinaPayPage = lazy(() => import("./components/CortinaPayPage"));
const AdminWorkspace = lazy(() =>
  import("./admin/AdminApp").then((m) => ({ default: m.AdminWorkspace })),
);
const AdminAuth = lazy(() =>
  import("./admin/AdminApp").then((m) => ({ default: m.AdminAuth })),
);
const AdminPreview = import.meta.env.DEV
  ? lazy(() => import("./admin/Preview"))
  : null;

function AdminLoading() {
  return (
    <div
      role="status"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f5f7fa",
        color: "#263541",
        font: "500 16px system-ui, sans-serif",
      }}
    >
      Loading your workspace…
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/privacy" element={<PublicLegalPage type="privacy" />} />
          <Route path="/terms" element={<PublicLegalPage type="terms" />} />
          <Route path="/account-deletion" element={<AccountDeletionPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/newsletter" element={<NewsletterPage />} />
          <Route path="*" element={<PublicNotFoundPage />} />
        </Route>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<AdminLoading />}>
              <AdminAuth />
            </Suspense>
          }
        />
        {AdminPreview && (
          <Route
            path="/admin/preview/*"
            element={
              <Suspense fallback={<AdminLoading />}>
                <AdminPreview />
              </Suspense>
            }
          />
        )}
        <Route path="/pay" element={
          <CheckoutBoundary>
            <Suspense fallback={<main className="public-document" role="status">Loading checkout...</main>}>
              <CortinaPayPage />
            </Suspense>
          </CheckoutBoundary>
        } />
        <Route
          path="/home/*"
          element={
            <Suspense fallback={<AdminLoading />}>
              <AdminWorkspace />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
