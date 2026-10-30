import Link from "next/link";

export const metadata = {
  title: "About Hill Booker",
  description: "Hill Booker is an online booking platform for homestays, hotels and vehicles in the hills and by the sea across India.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main className="page">
      <div className="prose">
        <h1 className="section-title">About Hill Booker</h1>
        <p>
          Hill Booker is an online booking platform for homestays, hotels and travel vehicles in hill stations and coastal towns across India,
          including Munnar, Ooty, Kodaikanal, Valparai, Coorg, Wayanad, Yercaud, Thekkady and Alleppey.
        </p>
        <h2>What we do</h2>
        <p>
          We help travellers find places to stay and vehicles to hire, and we help local hosts and vehicle operators get bookings.
          A room is shown only when it is free on every night of your stay, so what you see is what you can book.
          You pay a small advance online to confirm the booking, and you pay the balance at the property.
          Your confirmation and invoice reach you on WhatsApp, and the host is told about the booking straight away.
        </p>
        <h2>For hosts</h2>
        <p>
          If you run a homestay, hotel or vehicle service, you can list it on Hill Booker, set your own prices and notice period, and see all your bookings and payments in one place.
          <Link href="/register"> List your property</Link>.
        </p>
        <h2>Contact us</h2>
        <p>
          Hill Booker, No: 105A, Villagio, Green Groove, Jeyam Nagar, Kanchivakkam, Sriperumbudur, Chennai - 601301, Tamil Nadu, India.
          <br />
          Customer care: <a href="tel:+918300841442">+91 83008 41442</a> · <a href="tel:+919345777130">+91 93457 77130</a> · Email: <a href="mailto:hillbookerbookings@gmail.com">hillbookerbookings@gmail.com</a>
          <br />
          More details on our <Link href="/contact">Contact page</Link>.
        </p>
      </div>
    </main>
  );
}
