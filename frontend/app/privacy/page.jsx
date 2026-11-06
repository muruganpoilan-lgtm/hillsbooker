import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "What information Hill Booker collects, why, who we share it with, and how to ask us to delete it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="prose">
        <h1 className="section-title">Privacy Policy</h1>
        <p className="meta">Last updated: 6 November 2026</p>
        <p>
          This policy explains what information Hill Booker ("we", "us") collects when you use hillbooker.com or the Hill Booker app, or when you contact us on WhatsApp, Instagram, Facebook or YouTube,
          why we collect it and what we do with it.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li><b>Account details:</b> your name, email address, mobile number and password (stored in a protected form).</li>
          <li><b>Booking details:</b> the stays or vehicles you search for and book, dates, number of guests, amounts paid and invoices.</li>
          <li><b>Host details:</b> property or vehicle listings, photos, prices, bank or UPI details you add for payments, and the WhatsApp number where you want booking alerts.</li>
          <li><b>Payment information:</b> the payment reference, amount and status we receive from our payment partners (see Payments below). We never see or store your card number, CVV, net banking password or UPI PIN.</li>
          <li><b>Messages you send us:</b> enquiries, support requests, and comments or messages you send us on WhatsApp, Instagram, Facebook or YouTube.</li>
          <li><b>Technical information:</b> basic data such as your device and browser, and a sign-in token saved on your device so you stay logged in.</li>
        </ul>

        <h2>Bookings</h2>
        <p>
          When you book, we use your name, mobile number, email, dates and number of guests to hold and confirm the booking, send your confirmation and invoice, and pass the details the host or vehicle operator needs to welcome you.
          We keep a record of each booking for accounting, tax and legal reasons.
        </p>

        <h2>Payments</h2>
        <p>
          Advance payments are processed by <a href="https://razorpay.com/privacy/" target="_blank" rel="noopener noreferrer">Razorpay</a> (and, for some payments, Cashfree Payments).
          You enter your card, UPI or bank details on their secure pages, and they handle that information under their own privacy policies. They send us back the payment reference, amount and status
          so we can confirm your booking and process refunds. Where a host accepts UPI directly, the payment goes from you to the host, and the host confirms it to us.
        </p>

        <h2>WhatsApp notifications</h2>
        <ul>
          <li>We send booking messages (confirmations, invoices, reminders and cancellation notices) to the mobile number on your account, using the WhatsApp Business Platform from Meta. Hosts receive booking alerts on the WhatsApp number they give us.</li>
          <li>To send these, your mobile number and the message content pass through Meta's systems. Meta's handling of that data is covered by <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">WhatsApp's Privacy Policy</a>.</li>
          <li>If you message our WhatsApp number (+91 83008 41442), we keep the conversation so our team can help you with your booking.</li>
          <li>You can ask us to stop WhatsApp messages at any time by replying to us or emailing us. Booking confirmations are part of your booking, so turning them off means you will need to check My bookings instead.</li>
        </ul>

        <h2>Google sign-in</h2>
        <p>
          If you choose "Sign in with Google", we ask Google only for your basic profile and email address. We store your name and your verified email address to create or open your Hill Booker account.
          We do not receive your Google password, and we do not access your Gmail, contacts, Drive or any other Google data. You can remove Hill Booker's access at any time from your
          {" "}<a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account permissions</a>; your Hill Booker account stays until you ask us to delete it.
        </p>

        <h2>Instagram, Facebook and YouTube</h2>
        <ul>
          <li>We publish photos, Reels, Shorts and other videos about destinations, stays and vehicles on our Instagram, Facebook and YouTube accounts. Some of this is posted automatically using the official tools those platforms provide to businesses.</li>
          <li>When you comment on our posts, mention us or send us a message on Instagram or Facebook, the platform shares with us your username, your comment or message and its time, so that we can read and reply. We use this only to answer you and to help with bookings. Replies may be prepared with the help of automated tools and are checked against our own reply rules.</li>
          <li>We do not use Facebook or Instagram to sign you in, and we do not collect your friends list, followers or other profile data.</li>
          <li>We upload videos to YouTube using YouTube API Services. Watching or commenting on our videos on YouTube is covered by the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a> and the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>. We do not collect personal information from YouTube viewers.</li>
          <li>Our upload tool accesses only Hill Booker's own YouTube channel. It keeps just the ID and link of each video we upload, so the same video is not posted twice, and it does not read, store or share any other YouTube data. Access can be revoked at any time from <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account permissions</a>.</li>
          <li>The platforms' own use of your data is covered by the <a href="https://privacycenter.instagram.com/policy" target="_blank" rel="noopener noreferrer">Instagram</a> and <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer">Facebook</a> privacy policies.</li>
          <li>If you appear in one of our photos or videos and want it removed, email us and we will take it down.</li>
        </ul>

        <h2>How we use your information</h2>
        <ul>
          <li>To create your account, take bookings and payments, and send confirmations and invoices.</li>
          <li>To tell the host or operator about your booking so they can welcome you.</li>
          <li>To reply to your enquiries and messages, give customer support, and prevent fraud and misuse.</li>
          <li>To keep the records the law requires, and to improve Hill Booker.</li>
          <li>We do not sell your personal information, and we do not use it for advertising by other companies.</li>
        </ul>

        <h2>Who we share it with</h2>
        <ul>
          <li>The host or operator of what you booked, for that booking.</li>
          <li>Payment partners (Razorpay and Cashfree), to process payments and refunds.</li>
          <li>Service providers that help us run Hill Booker, such as hosting, WhatsApp messaging (Meta), email and Google sign-in, who use it only for that purpose.</li>
          <li>Authorities, when the law requires us to.</li>
        </ul>

        <h2>How long we keep it</h2>
        <p>
          We keep your account details until you ask us to delete your account. We keep booking and payment records for as long as Indian accounting and tax laws require (usually up to 8 years).
          We keep messages and comments for as long as needed to help you, and delete them when you ask.
        </p>

        <h2 id="data-deletion">Deleting your data</h2>
        <p>You can ask us to delete your account and the personal information we hold about you, including information we received through Google sign-in, WhatsApp, Instagram or Facebook.</p>
        <ul>
          <li>Email <a href="mailto:hillbookerbookings@gmail.com?subject=Data%20deletion%20request">hillbookerbookings@gmail.com</a> with the subject "Data deletion request". Send it from the email address on your account, or include the mobile number or Instagram/Facebook username you used with us, so we can find your data.</li>
          <li>We will confirm we have received your request, may ask you to verify that it is you, and will complete it within 30 days.</li>
          <li>We will delete your account, profile, saved items and messages. Booking and payment records that the law requires us to keep are retained only for that purpose and then deleted.</li>
          <li>If you have an upcoming booking, please cancel it first or tell us what you would like us to do with it.</li>
        </ul>

        <h2>Your other choices</h2>
        <ul>
          <li>You can see and correct your details in your account, and update your mobile number from My bookings.</li>
          <li>You can ask us for a copy of the information we hold about you by emailing the address above.</li>
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
