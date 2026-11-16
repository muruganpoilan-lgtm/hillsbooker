"""Hill Booker: the 9 owners missing from tools/hotel_software_emails.py.

Run on the server, from the folder holding docker-compose.prod.yml:

  docker compose -f docker-compose.prod.yml cp tools/hillbooker-deepavali-offer.jpg api:/tmp/offer.jpg
  docker compose -f docker-compose.prod.yml exec -T api python - < tools/hotel_software_emails_rest.py

The poster is copied into the container first rather than embedded, so this file
stays small. Sends one email per owner, 20 seconds apart, then a summary to
info@hillbooker.com. Each line of output says SENT or FAILED."""
import smtplib, sys, time
from email.message import EmailMessage
sys.path.insert(0, "/srv")
from app.config import settings

SUBJECT = "Free hotel software for {property}, and 5% commission if you list by 30 November"
BODY = "Hello {property} team,\n\nI am writing from Hill Booker (hillbooker.com), a booking website for hill-station stays in South India: Ooty, Munnar, Kodaikanal, Valparai and more. We came across {property} in {city} and would like to invite you to list with us.\n\nFREE HOTEL MANAGEMENT SOFTWARE FOR EVERY PARTNER\n\nEvery property listed with us gets our \"Manage my hotel\" section free. No charge, no monthly fee, it is simply part of your account:\n\n- Room board: every room shown as free, occupied, cleaning or under repair, with one-tap check-in and check-out\n- Guest register: walk-in guests and Hill Booker guests together, with address, ID proof (photo of the card), vehicle number and balance due\n- Orders and extras: food, laundry and travel desk charges added to the room bill, and a printable bill for the guest\n- Staff: attendance, monthly salary, advances paid\n- Expenses: daily spending, bills owed to suppliers\n- Stock: linen, toiletries and kitchen items, with a \"buy more\" warning\n- Excel download of the guest register, salary, expenses and stock\n\nIt opens in any browser on your phone or computer. Your records are private: only your own login can see your guests, staff and salary.\n\nOUR DEEPAVALI OFFER ENDS ON 30 NOVEMBER\n\n- List your property by 30 November 2026\n- Pay only 5% commission (our normal rate is 8%) on every booking until 28 February 2027\n- Listing is free: no joining fee, no monthly charges\n\nHOW BOOKINGS WORK\n\n- You add your rooms, photos and prices, and open only the dates you want to sell\n- Guests pay a 30% advance online and pay the rest to you at check-in\n- You get a WhatsApp message the moment a booking is made or cancelled\n- Your share is paid to your UPI ID or bank account after check-in\n\nList your property here (about 10 minutes): https://hillbooker.com/register\n\nOur offer poster is attached.\n\nQuestions? Call or WhatsApp +91 83008 41442 or +91 93457 77130, or just reply to this email.\n\nWarm regards,\nJo\nHill Booker\nhttps://hillbooker.com | +91 83008 41442 | +91 93457 77130\n\nIf you would rather not hear from us, reply \"no thanks\" and we will not email you again.\n"
OWNERS = [["Yercaud", "MM Resorts", "mmresortsycd@gmail.com"],
          ["Yercaud", "Wellington Hill Resort", "wellingtonyercaud@gmail.com"],
          ["Yercaud", "Ans Homestay", "anshomestay.yercaud@gmail.com"],
          ["Yercaud", "Yercaud Bungalow Stay", "booking@yercaudbungalowstay.com"],
          ["Yercaud", "Jason Homestay", "heygotrip@gmail.com"],
          ["Munnar", "Anna Homestay", "welcome@annahomestay.com"],
          ["Munnar", "Casillda Munnar", "casilldamunnar@gmail.com"],
          ["Munnar", "Munnar Heritage Cottages", "info@munnarcottages.co"],
          ["Kodaikanal", "Kodaikanal Group Stay", "info@kodaikanalgroupstay.com"]]

try:
    POSTER = open("/tmp/offer.jpg", "rb").read()
except FileNotFoundError:
    print("The poster is not in the container. Run the docker compose cp line first.")
    sys.exit(1)


def send(to, subject, body):
    msg = EmailMessage()
    msg["Subject"], msg["To"], msg["From"] = subject, to, settings.smtp_from
    msg["Reply-To"] = "info@hillbooker.com"
    msg.set_content(body)
    msg.add_attachment(POSTER, maintype="image", subtype="jpeg", filename="Hill-Booker-Deepavali-offer.jpg")
    try:
        if settings.smtp_security == "ssl":
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30)
            if settings.smtp_security == "starttls":
                server.starttls()
        with server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception as e:
        print("   error:", e, flush=True)
        return False


if not (settings.smtp_host and settings.smtp_from):
    print("Email is not set up on the server (SMTP_HOST / SMTP_FROM empty). Nothing sent.")
    sys.exit(1)

sent = failed = 0
bad = []
for i, (city, prop, email) in enumerate(OWNERS, 1):
    ok = send(email, SUBJECT.format(property=prop, city=city), BODY.format(property=prop, city=city))
    print(f"{i:>2}/{len(OWNERS)} {'SENT  ' if ok else 'FAILED'} {email}  ({prop}, {city})", flush=True)
    if ok:
        sent += 1
    else:
        failed += 1
        bad.append(email)
    if i < len(OWNERS):
        time.sleep(20)

send("info@hillbooker.com", f"[Done] Hill Booker owner emails (remaining 9 owners): {sent} sent, {failed} failed",
     ("Failed addresses:\n" + "\n".join(bad) + "\n\n" if bad else "")
     + "This is what each owner received:\n\n" + BODY.format(property="Sample Homestay", city="Ooty"))
print(f"\nDone. {sent} sent, {failed} failed.")
