// Answers for the website chatbot, in English (en) and Tamil (ta).
// To change what the bot says, edit this file. "words" are what a guest might type; the bot picks the topic with the most matches.
const WA = "918300841442";

export const WHATSAPP_LINK = (text) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;

export const TOPICS = [
  {
    id: "book",
    q: { en: "How do I book a stay?", ta: "தங்குமிடத்தை எப்படி முன்பதிவு செய்வது?" },
    words: ["book", "booking", "reserve", "how to", "stay", "room", "முன்பதிவு", "புக்", "அறை", "தங்க"],
    a: {
      en: "Enter a city and your dates on the home page, pick a place and a room, and pay a small advance online. You will see only rooms that are free on every night of your stay. Your booking is confirmed as soon as the payment goes through.",
      ta: "முகப்புப் பக்கத்தில் நகரத்தையும் தேதிகளையும் உள்ளிடுங்கள். இடத்தையும் அறையையும் தேர்ந்தெடுத்து, சிறிய முன்பணத்தை ஆன்லைனில் செலுத்துங்கள். நீங்கள் தங்கும் எல்லா இரவுகளிலும் காலியாக உள்ள அறைகள் மட்டுமே காட்டப்படும். பணம் செலுத்திய உடனே முன்பதிவு உறுதியாகும்.",
    },
    links: [{ label: { en: "Search stays", ta: "தங்குமிடங்களைத் தேடுங்கள்" }, href: "/" }],
  },
  {
    id: "pay",
    q: { en: "How much do I pay, and how?", ta: "எவ்வளவு, எப்படி செலுத்த வேண்டும்?" },
    words: ["pay", "payment", "advance", "30", "upi", "card", "price", "cost", "how much", "பணம்", "முன்பணம்", "செலுத்த", "கட்டணம்"],
    a: {
      en: "You pay an advance online (usually 30% of the stay, shown before you pay) by UPI, card or net banking through Razorpay. You pay the balance at the property. Hill Booker never stores your card details.",
      ta: "தங்குமிடத்தின் தொகையில் முன்பணத்தை (பொதுவாக 30%, பணம் செலுத்தும் முன் காட்டப்படும்) UPI, கார்டு அல்லது நெட் பேங்கிங் மூலம் Razorpay வழியாக ஆன்லைனில் செலுத்துங்கள். மீதித் தொகையை தங்குமிடத்தில் செலுத்தினால் போதும். உங்கள் கார்டு விவரங்களை Hill Booker சேமிப்பதில்லை.",
    },
  },
  {
    id: "cancel",
    q: { en: "How do I cancel a stay?", ta: "முன்பதிவை எப்படி ரத்து செய்வது?" },
    words: ["cancel", "cancellation", "refund", "money back", "ரத்து", "கேன்சல்", "திரும்ப"],
    a: {
      en: "You can cancel a stay yourself within 10 minutes of paying, from My bookings, and your advance is refunded in full. After 10 minutes, please call Hill Booker customer care. For vehicles, you get a full refund if you cancel at least 2 days (48 hours) before the trip starts.",
      ta: "முன்பதிவு செய்த 10 நிமிடங்களுக்குள் 'My bookings' பக்கத்தில் நீங்களே ரத்து செய்யலாம்; முன்பணம் முழுவதும் திரும்பக் கிடைக்கும். 10 நிமிடங்களுக்குப் பிறகு Hill Booker வாடிக்கையாளர் சேவையை அழைக்கவும். வாகனங்களுக்கு, பயணம் தொடங்குவதற்கு குறைந்தது 2 நாட்கள் (48 மணி நேரம்) முன்பு ரத்து செய்தால் முழு பணம் திரும்பக் கிடைக்கும்.",
    },
    links: [
      { label: { en: "My bookings", ta: "என் முன்பதிவுகள்" }, href: "/bookings" },
      { label: { en: "Refund policy", ta: "பணம் திரும்பப் பெறும் கொள்கை" }, href: "/refund-policy" },
    ],
  },
  {
    id: "refund",
    q: { en: "When will I get my refund?", ta: "பணம் எப்போது திரும்பக் கிடைக்கும்?" },
    words: ["when", "refund", "how long", "days", "bank", "நாள்", "எப்போது", "வங்கி"],
    a: {
      en: "Refunds go back to the same payment method you used, and the full advance is returned with no fee deducted. It usually shows in your account within 5 to 7 working days, depending on your bank.",
      ta: "நீங்கள் பணம் செலுத்திய அதே முறையிலேயே பணம் திரும்பும்; முன்பணம் முழுவதும் எந்தக் கழிவும் இன்றி வழங்கப்படும். உங்கள் வங்கியைப் பொறுத்து பொதுவாக 5 முதல் 7 வேலை நாட்களில் உங்கள் கணக்கில் வரும்.",
    },
    links: [{ label: { en: "Refund policy", ta: "பணம் திரும்பப் பெறும் கொள்கை" }, href: "/refund-policy" }],
  },
  {
    id: "vehicles",
    q: { en: "Can I book a car, van or bus?", ta: "கார், வேன் அல்லது பேருந்தை முன்பதிவு செய்யலாமா?" },
    words: ["car", "van", "bus", "vehicle", "driver", "taxi", "cab", "tempo", "கார்", "வேன்", "பேருந்து", "வாகனம்", "டாக்ஸி"],
    a: {
      en: "Yes. Open Cars & vans to see vehicles with a driver. If you do not find what you need, send us your trip details and we will arrange it.",
      ta: "ஆம். ஓட்டுநருடன் உள்ள வாகனங்களைப் பார்க்க 'Cars & vans' பக்கத்தைத் திறக்கவும். தேவையானது கிடைக்கவில்லை என்றால் உங்கள் பயண விவரங்களை அனுப்புங்கள், நாங்கள் ஏற்பாடு செய்கிறோம்.",
    },
    links: [
      { label: { en: "Cars & vans", ta: "கார்கள் & வேன்கள்" }, href: "/vehicles" },
      { label: { en: "Send an enquiry", ta: "விசாரணை அனுப்புங்கள்" }, href: "/enquiry" },
    ],
  },
  {
    id: "tour",
    q: { en: "Group or corporate tours?", ta: "குழு அல்லது நிறுவனச் சுற்றுலா?" },
    words: ["group", "corporate", "tour", "office", "trip", "team", "students", "குழு", "சுற்றுலா", "நிறுவன", "டூர்"],
    a: {
      en: "Yes, we help with group and corporate tours. Send us the destination, start date and number of people, and our team will contact you.",
      ta: "ஆம், குழு மற்றும் நிறுவனச் சுற்றுலாக்களுக்கு நாங்கள் உதவுகிறோம். இடம், தொடங்கும் தேதி, நபர்களின் எண்ணிக்கை ஆகியவற்றை அனுப்புங்கள்; எங்கள் குழு உங்களைத் தொடர்புகொள்ளும்.",
    },
    links: [
      { label: { en: "Group tour enquiry", ta: "குழு சுற்றுலா விசாரணை" }, href: "/enquiry?kind=group" },
      { label: { en: "Corporate tour enquiry", ta: "நிறுவனச் சுற்றுலா விசாரணை" }, href: "/enquiry?kind=corporate" },
    ],
  },
  {
    id: "host",
    q: { en: "How do I list my property?", ta: "என் சொத்தை எப்படிப் பட்டியலிடுவது?" },
    words: ["list", "host", "property", "owner", "add my", "homestay", "become", "பட்டியல்", "உரிமையாளர்", "ஹோஸ்ட்", "சேர்க்க"],
    a: {
      en: "Create an account (or log in), choose to become a host, then add your property with photos, rooms and prices, and your UPI ID so we can pay you. Our team checks every listing before it goes live.",
      ta: "கணக்கை உருவாக்குங்கள் (அல்லது உள்நுழையுங்கள்), ஹோஸ்ட் ஆக மாறுங்கள். பிறகு புகைப்படங்கள், அறைகள், விலைகள் மற்றும் உங்களுக்குப் பணம் அனுப்புவதற்கான UPI ID ஆகியவற்றுடன் சொத்தைச் சேர்க்கவும். ஒவ்வொரு பட்டியலையும் எங்கள் குழு சரிபார்த்த பிறகே வெளியிடுவோம்.",
    },
    links: [{ label: { en: "List your property", ta: "சொத்தைப் பட்டியலிடுங்கள்" }, href: "/dashboard" }],
  },
  {
    id: "commission",
    q: { en: "What does Hill Booker charge hosts?", ta: "ஹோஸ்ட்களிடம் Hill Booker எவ்வளவு கட்டணம் வாங்குகிறது?" },
    words: ["commission", "charge", "fee", "earn", "payout", "paid", "host paid", "கமிஷன்", "கட்டணம்", "வருமானம்", "பணம் பெற"],
    a: {
      en: "Hill Booker takes an 8% commission on the booking total, deducted from the advance the guest pays online. We send the rest of the advance to your UPI ID after the guest checks in, and you collect the balance at the property.",
      ta: "முன்பதிவு மொத்தத் தொகையில் 8% கமிஷனை Hill Booker எடுத்துக்கொள்கிறது; இது விருந்தினர் ஆன்லைனில் செலுத்தும் முன்பணத்திலிருந்து கழிக்கப்படும். விருந்தினர் செக்-இன் செய்த பிறகு மீதமுள்ள முன்பணத்தை உங்கள் UPI ID-க்கு அனுப்புவோம்; மீதித் தொகையை தங்குமிடத்தில் நீங்கள் பெறலாம்.",
    },
  },
  {
    id: "login",
    q: { en: "I can't log in / forgot password", ta: "உள்நுழைய முடியவில்லை / கடவுச்சொல் மறந்துவிட்டது" },
    words: ["login", "log in", "password", "forgot", "sign in", "account", "register", "sign up", "உள்நுழை", "கடவுச்சொல்", "மறந்த", "கணக்கு"],
    a: {
      en: "You can log in with your email and password, or with Google. If you forgot your password, use the reset link and we will email you a new one.",
      ta: "மின்னஞ்சல் மற்றும் கடவுச்சொல் மூலம் அல்லது Google மூலம் உள்நுழையலாம். கடவுச்சொல்லை மறந்துவிட்டால் மீட்டமைப்பு இணைப்பைப் பயன்படுத்துங்கள்; புதியதை மின்னஞ்சலில் அனுப்புவோம்.",
    },
    links: [
      { label: { en: "Log in", ta: "உள்நுழை" }, href: "/login" },
      { label: { en: "Reset password", ta: "கடவுச்சொல் மீட்டமை" }, href: "/forgot-password" },
    ],
  },
  {
    id: "invoice",
    q: { en: "Where is my invoice?", ta: "என் இன்வாய்ஸ் எங்கே?" },
    words: ["invoice", "bill", "receipt", "pdf", "gst", "இன்வாய்ஸ்", "ரசீது", "பில்"],
    a: {
      en: "When your booking is confirmed we send your invoice as a PDF on WhatsApp to the mobile number on your account. You can also see your booking in My bookings.",
      ta: "முன்பதிவு உறுதியானதும், உங்கள் கணக்கில் உள்ள மொபைல் எண்ணுக்கு இன்வாய்ஸை PDF ஆக WhatsApp-ல் அனுப்புகிறோம். 'My bookings' பக்கத்திலும் உங்கள் முன்பதிவைப் பார்க்கலாம்.",
    },
    links: [{ label: { en: "My bookings", ta: "என் முன்பதிவுகள்" }, href: "/bookings" }],
  },
  {
    id: "hold",
    q: { en: "How long is my room held?", ta: "என் அறை எவ்வளவு நேரம் ஒதுக்கப்படும்?" },
    words: ["hold", "held", "room held", "held for", "expire", "timeout", "10 minutes", "ஒதுக்க", "நிமிடம்"],
    a: {
      en: "A room is held for 10 minutes while you pay. If the payment does not finish in time, the room goes back on sale. If your money was taken after the hold ended and the room is gone, we refund the full amount automatically.",
      ta: "நீங்கள் பணம் செலுத்தும்போது அறை 10 நிமிடங்களுக்கு ஒதுக்கி வைக்கப்படும். அதற்குள் பணம் செலுத்தாவிட்டால் அறை மீண்டும் விற்பனைக்கு வரும். ஒதுக்கீடு முடிந்த பிறகு பணம் எடுக்கப்பட்டு அறை இல்லாவிட்டால், முழுத் தொகையும் தானாகத் திரும்ப வழங்கப்படும்.",
    },
  },
  {
    id: "contact",
    q: { en: "Talk to a person", ta: "ஒருவரிடம் பேச வேண்டும்" },
    words: ["contact", "call", "phone", "number", "whatsapp", "email", "help", "support", "agent", "human", "person", "தொடர்பு", "அழை", "போன்", "உதவி", "வாட்ஸ்அப்"],
    a: {
      en: "Our customer care is happy to help. Phone or WhatsApp: +91 83008 41442 (also +91 93457 77130). Email: info@hillbooker.com. Please keep your booking details handy.",
      ta: "எங்கள் வாடிக்கையாளர் சேவை உதவ தயாராக உள்ளது. தொலைபேசி அல்லது WhatsApp: +91 83008 41442 (மேலும் +91 93457 77130). மின்னஞ்சல்: info@hillbooker.com. உங்கள் முன்பதிவு விவரங்களை தயாராக வைத்துக்கொள்ளுங்கள்.",
    },
    links: [{ label: { en: "Chat on WhatsApp", ta: "WhatsApp-ல் பேசுங்கள்" }, href: WHATSAPP_LINK("Hi Hill Booker, I need help with my booking."), external: true }],
  },
];

export const GREETING = {
  en: "Hi! I am the Hill Booker assistant. Ask me about booking, payments, cancellations, vehicles or listing your property.",
  ta: "வணக்கம்! நான் Hill Booker உதவியாளர். முன்பதிவு, பணம் செலுத்துதல், ரத்து, வாகனங்கள், சொத்தைப் பட்டியலிடுதல் பற்றி கேளுங்கள்.",
};

export const FALLBACK = {
  en: "Sorry, I do not have an answer for that. You can pick a question below, or talk to our team on WhatsApp.",
  ta: "மன்னிக்கவும், அதற்கான பதில் என்னிடம் இல்லை. கீழே உள்ள கேள்விகளில் ஒன்றைத் தேர்ந்தெடுக்கலாம், அல்லது எங்கள் குழுவிடம் WhatsApp-ல் பேசலாம்.",
};

export const UI = {
  en: { title: "Hill Booker help", open: "Chat with us", close: "Close chat", placeholder: "Type your question", send: "Send", quick: "Common questions" },
  ta: { title: "Hill Booker உதவி", open: "எங்களுடன் பேசுங்கள்", close: "அரட்டையை மூடு", placeholder: "உங்கள் கேள்வியை எழுதுங்கள்", send: "அனுப்பு", quick: "பொதுவான கேள்விகள்" },
};

// Picks the topic whose words appear most often in the question. Returns null when nothing matches.
export function findTopic(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return null;
  let best = null;
  let bestScore = 0;
  for (const topic of TOPICS) {
    let score = 0;
    for (const w of topic.words) if (t.includes(w.toLowerCase())) score += w.length;
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best;
}
