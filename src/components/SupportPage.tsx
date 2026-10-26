import { Clock3, Mail, Phone } from "lucide-react";

function SupportPage() {
  return (
    <main className="public-document public-support-page">
      <p className="public-eyebrow">We are here to help</p>
      <h1>Clean Stream support</h1>
      <p className="public-document-lead">For machine, payment, wallet, refund, or account questions, contact us with the location, machine name, and approximate time of the issue.</p>
      <div className="public-support-methods">
        <a href="tel:+17656102114"><Phone /><span><strong>Call</strong>(765) 610-2114</span></a>
        <a href="mailto:support@cleanstreamlaundry.com"><Mail /><span><strong>Email</strong>support@cleanstreamlaundry.com</span></a>
        <div><Clock3 /><span><strong>Support hours</strong>Monday-Friday, 9:00 AM-5:00 PM ET</span></div>
      </div>
      <section>
        <h2>Payment or machine issue</h2>
        <p>Keep the payment confirmation page open when possible. Include the location, machine name or number, amount, payment method, and approximate time when you contact us. Do not send complete card numbers or passwords.</p>
      </section>
      <section>
        <h2>Refunds and maintenance</h2>
        <p>Signed-in customers can submit refund and facility-maintenance requests from the app. We review the related machine and payment records and will follow up through the contact information on your account.</p>
      </section>
    </main>
  );
}

export default SupportPage;
