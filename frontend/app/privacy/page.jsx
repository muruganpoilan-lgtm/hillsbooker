import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "What information Hill Booker collects, why, who we share it with and how you can control it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="prose">
        <h1 className="section-title">Privacy Policy</h1>
        <p className="meta">Last updated: 29 October 2026</p>
        <p>
          This policy explains what information Hill Booker ("we", "us") collects when you use hillbooker.com or the Hill Booker app, why we collect it and what we do with it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li><b>Account details:</b> your name, email address, mobile number and password (stored in a protected form). If you sign in with Google, we receive your name and email from Google.</li>
          <li><b>Booking details:</b> the stays or vehicles you search for and book, dates, number of guests, amounts paid and invoices.</li>
          <li><b>Host details:</b> property or vehicle listings, photos, prices, bank or UPI details you add for payments, and the WhatsApp number where you want booking alerts.</li>
          <li><b>Payment information:</b> payments are handled by our payment partners (Razorpay or Cashfree). Card, UPI and bank details are entered on their secure pages. We do not store your card number or UPI PIN. We keep the payment reference and status.</li>
          <li><b>Technical information:</b> basic data such as your device and browser, and a sign-in token saved on your device so you stay logged in.</li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To create your account, take bookings and payments, and send confirmations and invoices.</li>
          <li>To tell the host about your booking, including your name, mobile number and booking dates, so they can welcome you.</li>
          <li>To send WhatsApp messages about your booking (confirmation, invoice, host alerts) through the WhatsApp Business platform from Meta.</li>
          <li>To give customer support, prevent fraud and misuse, and keep our records as the law requires.</li>
          <li>To improve Hill Booker. We do not sell your personal information.</li>
        </ul>

        <h2>Who we share it with</h2>
        <ul>
          <li>The host or operator of what you booked, for that booking.</li>
          <li>Payment partners, to process your payments and refunds.</li>
          <li>Service providers that help us run Hill Booker, such as hosting, WhatsApp messaging and email, who only use it for that purpose.</li>
          <li>Authorities, when the law requires us to.</li>
        </ul>

        <h2>How long we keep it</h2>
        <p>We keep booking and payment records for as long as needed for accounting, tax and legal reasons. We keep your account details until you ask us to delete the account.</p>

        <h2>Your choices</h2>
        <ul>
          <li>You can see and correct your details in your account, and update your mobile number from My bookings.</li>
          <li>You can ask us to delete your account or the information we hold about you, by writing to <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a>. Some records must be kept by law.</li>
          <li>You can stop WhatsApp messages by telling us. Booking confirmations are needed for your booking, so deleting your number may limit them.</li>
        </ul>

        <h2>Security and children</h2>
        <p>We use reasonable safeguards, including encrypted connections, to protect your information. No system is perfectly secure. Hill Booker is not meant for children under 18 to use on their own.</p>

        <h2>Changes and contact</h2>
        <p>
          We may update this policy and will change the date above. Questions? Email <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a> or call <a href="tel:+918300841442">+91 83008 41442</a>.
          See also our <Link href="/terms">Terms and Conditions</Link>.
        </p>
      </div>
    </main>
  );
}
