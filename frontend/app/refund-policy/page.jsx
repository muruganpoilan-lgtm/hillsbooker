import Link from "next/link";

export const metadata = {
  title: "Refund and Cancellation Policy",
  description: "How cancellations and refunds work on Hill Booker: a full refund of your advance when you cancel at least 2 days before check-in.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicyPage() {
  return (
    <main className="page">
      <div className="prose">
        <h1 className="section-title">Refund and Cancellation Policy</h1>
        <p className="meta">Last updated: 29 October 2026</p>
        <p>
          When you book on Hill Booker you pay an advance online, and you pay the balance at the property or to the vehicle operator. This page explains what happens if you cancel.
        </p>

        <h2>Cancelling a stay</h2>
        <ul>
          <li>
            <b>Cancel within 10 minutes of booking:</b> your advance is refunded in full. This is the only time you can cancel a stay on your own from the website or app.
          </li>
          <li>
            <b>After 10 minutes:</b> please call Hill Booker customer care. Refunds after that depend on the host and are decided case by case.
          </li>
          <li>You cannot cancel online after the stay has started.</li>
        </ul>

        <h2>Cancelling a vehicle booking</h2>
        <ul>
          <li>
            <b>Cancel at least 2 days (48 hours) before check-in:</b> your advance is refunded in full. The time is counted up to 12:00 am (midnight) at the start of your
            check-in date, India time. For a vehicle, it is counted up to the start date of the trip.
          </li>
          <li>
            <b>Cancel later than that:</b> the advance is not refunded.
          </li>
          <li>You cannot cancel online after the stay or trip has started.</li>
        </ul>
        <p>You can cancel from <Link href="/bookings">My bookings</Link> on the website or in the app.</p>

        <h2>If the host cancels or cannot honour your booking</h2>
        <p>If a host or vehicle operator cancels a confirmed booking, or cannot give you the room or vehicle you booked, we refund your advance in full.</p>

        <h2>If your payment arrives after the hold ends</h2>
        <p>
          A room or vehicle is held for 10 minutes while you pay. If your payment reaches us after the hold ended and the room or vehicle is no longer free, we refund the full amount
          to your original payment method automatically.
        </p>

        <h2>How refunds are paid</h2>
        <ul>
          <li>Refunds go back to the same payment method you used (UPI, card or bank).</li>
          <li>Once a refund is issued, it usually shows in your account within 5 to 7 working days, depending on your bank.</li>
          <li>The full advance is returned. We do not deduct any fee from it.</li>
          <li>If you paid the host directly by UPI, the host returns the money to you in line with this policy. Contact us if it is delayed.</li>
        </ul>

        <h2>Changing dates</h2>
        <p>To change your dates, cancel under the rules above and book again, or ask the host for a change. A host may agree to move your booking without a charge.</p>

        <h2>Problems with a refund</h2>
        <p>
          Write to <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a> or call <a href="tel:+918300841442">+91 83008 41442</a> with your booking details.
          See also our <Link href="/terms">Terms and Conditions</Link>.
        </p>
      </div>
    </main>
  );
}
