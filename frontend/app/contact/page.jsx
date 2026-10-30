export const metadata = {
  title: "Contact Hill Booker",
  description: "Contact Hill Booker customer care by phone, WhatsApp or email, and find our office address.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="page">
      <div className="prose">
        <h1 className="section-title">Contact us</h1>
        <p>Questions about a booking, a payment, a refund or listing your property? We are happy to help.</p>
        <h2>Customer care</h2>
        <p>
          Phone: <a href="tel:+918300841442">+91 83008 41442</a> · <a href="tel:+919345777130">+91 93457 77130</a>
          <br />
          WhatsApp: <a href="https://wa.me/918300841442" target="_blank" rel="noopener noreferrer">+91 83008 41442</a>
          <br />
          Email: <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a>
        </p>
        <p>Please keep your booking details handy: the property name, your check-in date and the phone number you booked with.</p>
        <h2>Office address</h2>
        <address style={{ fontStyle: "normal" }}>
          Hill Booker
          <br />
          No: 105A, Villagio, Green Groove, Jeyam Nagar,
          <br />
          Kanchivakkam, Sriperumbudur,
          <br />
          Chennai - 601301, Tamil Nadu, India
        </address>
        <h2>Grievances</h2>
        <p>
          If you are not happy with how a booking or payment was handled, write to <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a> with the subject
          "Grievance". We will reply within 2 working days and aim to resolve the matter within 15 days.
        </p>
      </div>
    </main>
  );
}
