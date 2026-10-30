import Link from "next/link";

export const metadata = {
  title: "Terms and Conditions",
  description: "The terms for using Hill Booker to book stays and vehicles, and for hosts who list them.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="page">
      <div className="prose">
        <h1 className="section-title">Terms and Conditions</h1>
        <p className="meta">Last updated: 29 October 2026</p>
        <p>
          These terms apply when you use hillbooker.com or the Hill Booker app ("Hill Booker", "we", "us"). By creating an account or making a booking you agree to them.
          Hill Booker is operated from No: 105A, Villagio, Green Groove, Jeyam Nagar, Kanchivakkam, Sriperumbudur, Chennai - 601301, Tamil Nadu, India.
        </p>

        <h2>1. What Hill Booker is</h2>
        <p>
          Hill Booker is an online platform that lets travellers book stays (homestays, hotels and similar) and travel vehicles offered by independent hosts and vehicle operators.
          We do not own or run the properties or vehicles. The stay or ride itself is provided by the host or operator, and your booking is an agreement between you and them.
        </p>

        <h2>2. Accounts</h2>
        <ul>
          <li>You need an account to book or to list. Give correct details, including a working mobile number.</li>
          <li>Keep your password safe. You are responsible for what happens in your account.</li>
          <li>One email address is used for one kind of account (guest, host or operator).</li>
        </ul>

        <h2>3. Booking and payment</h2>
        <ul>
          <li>Rooms and vehicles shown on Hill Booker are free for the dates you search. Hosts may set a minimum booking notice, so very near dates may not be bookable.</li>
          <li>When you reserve, the room or vehicle is held for 10 minutes. Your booking is confirmed when your advance payment is received.</li>
          <li>You pay an advance online by UPI, card or net banking through our payment partners. We do not store your card details.</li>
          <li>The balance is paid at the property or to the vehicle operator, as shown on your booking.</li>
          <li>Some hosts accept UPI directly. In that case the host confirms your payment, and your booking is confirmed after that.</li>
          <li>Guests pay no extra fee to Hill Booker. We charge hosts a commission of 8% of the booking price, which is taken out of the advance.</li>
          <li>Your invoice is sent to your WhatsApp number and can also be opened from My bookings.</li>
        </ul>

        <h2>4. Cancellations and refunds</h2>
        <p>Cancellations and refunds follow our <Link href="/refund-policy">Refund and Cancellation Policy</Link>.</p>

        <h2>5. Guests</h2>
        <ul>
          <li>Carry a valid photo ID and show it at check-in. The number of guests must not exceed what you booked.</li>
          <li>Follow the host's house rules and look after the property. You are responsible for damage you cause.</li>
          <li>Do not use Hill Booker for anything unlawful.</li>
        </ul>

        <h2>6. Hosts and operators</h2>
        <ul>
          <li>Listings, photos, prices and availability must be true and up to date. You must hold the licences and permissions your business needs.</li>
          <li>You must honour confirmed bookings. If you cannot, tell the guest and us straight away. The guest's advance will be refunded.</li>
          <li>You may upload only photos you took yourself or have permission to use. Do not upload photos from other websites, apps or social media. You are responsible for any claim about a photo you upload, and we may remove a photo or listing on a copyright complaint.</li>
          <li>Keep your calendar current. If you use a calendar sync, you are responsible for checking it.</li>
          <li>Hill Booker's commission is 8% of the booking price. It is taken out of the advance the guest pays when booking. For example, on a booking of ₹10,000 with a 30% advance (₹3,000), ₹800 is Hill Booker's commission and ₹2,200 is yours. For an advance paid online, we collect it and, once the guest has checked in, pay you your share to the UPI ID you have saved with us. The amount due to you is shown on your Payments page.</li>
          <li>If a guest pays the advance straight to your UPI ID, you keep that payment and owe Hill Booker the 8% commission on the booking price, which is also shown on your Payments page.</li>
          <li>The balance of the booking is paid by the guest to you at the property or on the trip. No further commission is charged on the balance.</li>
          <li>If a booking is cancelled and the advance is refunded to the guest, no commission is due on it.</li>
          <li>We may remove a listing or close an account that breaks these terms or harms guests.</li>
        </ul>

        <h2>7. Our responsibility</h2>
        <p>
          We take care to show correct information, but we do not guarantee the quality, safety or availability of any property or vehicle, and we are not responsible for the acts of hosts, operators or guests.
          To the extent the law allows, our responsibility for any booking is limited to the amount you paid us for it.
        </p>

        <h2>8. Privacy</h2>
        <p>How we handle your information is explained in our <Link href="/privacy">Privacy Policy</Link>.</p>

        <h2>9. Changes to these terms</h2>
        <p>We may update these terms. The date at the top shows when they last changed. Using Hill Booker after a change means you accept it.</p>

        <h2>10. Law and disputes</h2>
        <p>These terms are governed by the laws of India. Courts at Chennai, Tamil Nadu have jurisdiction over any dispute.</p>

        <h2>11. Contact</h2>
        <p>
          <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a> · <a href="tel:+918300841442">+91 83008 41442</a> · see also our <Link href="/contact">Contact page</Link>.
        </p>
      </div>
    </main>
  );
}
