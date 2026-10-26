import { Mail, Smartphone } from "lucide-react";

function AccountDeletionPage() {
  return (
    <main className="public-document">
      <p className="public-eyebrow">Account deletion and recovery</p>
      <h1>Delete your Clean Stream account</h1>
      <p className="public-document-lead">Effective October 5, 2026</p>
      <p className="public-document-lead">You can request deletion from the mobile app or by contacting Clean Stream. There is no fee to delete your account.</p>

      <section className="public-delete-option">
        <Smartphone />
        <div>
          <h2>Delete in the app</h2>
          <p>Sign in, open <strong>Settings</strong>, select <strong>Edit Profile</strong>, choose <strong>Delete Account</strong>, and confirm the request.</p>
        </div>
      </section>

      <section className="public-delete-option">
        <Mail />
        <div>
          <h2>Request deletion by email</h2>
          <p>Email <a href="mailto:support@cleanstreamlaundry.com?subject=Clean%20Stream%20account%20deletion">support@cleanstreamlaundry.com</a> from the address associated with your account. Use the subject “Clean Stream account deletion.” We may verify ownership before completing the request.</p>
        </div>
      </section>

      <section>
        <h2>What happens next</h2>
        <p>A deletion request places your account in pending deletion and restricts ordinary app access. You may explicitly restore the original account and its wallet links after verifying ownership and completing any required multi-factor authentication, before the server-set deadline 90 days after the deletion request. Signing in alone does not restore the account. Restoration does not reset refund deadlines or re-enable optional messages. At or after the deadline, restoration is unavailable even if cleanup has not occurred.</p>
        <p>By voluntarily requesting deletion, you agree to surrender unused purchased and promotional laundry credit and unissued reward progress if you do not explicitly restore your account before the 90-day recovery deadline. At that deadline, the remaining credit and reward progress are forfeited, except where applicable law prohibits forfeiture. Deletion creates no right to a payout or refund, and a new account does not restore forfeited credit. Use credit before requesting deletion or submit an eligible refund request within the existing policy deadline. Deletion does not extend the 48-hour unused-load refund window or the same-day machine-reporting requirement.</p>
        <p>After the recovery period, we delete your login and ordinary profile through our cleanup process. We retain only records needed for legal obligations, payment reconciliation, and unresolved claims. Timely refund requests and machine claims remain subject to their existing eligibility rules; deletion itself is not a reason for approval. Disputes follow the Terms of Service and applicable payment-provider processes. Rights that cannot lawfully be waived remain unaffected.</p>
      </section>
    </main>
  );
}

export default AccountDeletionPage;
