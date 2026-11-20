# Hill Booker: online room booking

An online room booking platform (hotels and homestays) for India, with outside owners listing their own properties.

## Assumptions (change any of these)
- India first: prices in INR, payments through Razorpay
- Hotels and homestays (apartments and resorts are supported by the schema)
- Website first (Next.js), mobile app later
- Owners list their own properties; an admin approves them before they go live

## Stack
- Backend: FastAPI (Python), PostgreSQL, Redis
- Frontend: Next.js 15 (React, plain CSS), in the `frontend` folder
- Payments: Razorpay (built, works in test mode with your test keys)

## Run it
```bash
docker compose up -d                 # Postgres and Redis, schema loads automatically
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```
API docs open at http://localhost:8000/docs

## Run the website
Install [Node.js](https://nodejs.org) 20 or newer, then in a second terminal:
```bash
cd frontend
npm install
copy .env.local.example .env.local     # Mac or Linux: cp .env.local.example .env.local
npm run dev
```
Open http://localhost:3000. The backend must be running too. Open the site at `localhost`, not at your
computer's network address, because the backend only allows `localhost:3000` and `127.0.0.1:3000`.

Guest pages: home (ridge hero, search slip, altitude list of cities), search results with a filter sidebar,
property page with photo gallery and full-screen viewer, login, sign up, and My bookings (with the 10-minute hold timer).
Properties without photos show a drawn hill-ridge picture until the owner uploads some.

Owner and admin pages (the **Dashboard** link in the header):
- `/dashboard`: your properties and their status. Admins see every property and an approve/reject list.
- `/dashboard/new`: add a property (name, type, city, address, description, amenities).
- `/dashboard/properties/{id}`: edit details, upload property photos, add rooms, upload room photos,
  open nights with the number of rooms and an optional price, see the next 60 nights.
- `/dashboard/bookings`: confirmed and cancelled bookings.

To list a property: sign up with "I want to list my property" ticked, add a property, add a room, open some
nights, then an admin approves it. An admin account can't be made on the sign-up page. Create one by running
`UPDATE users SET role = 'admin' WHERE email = 'you@example.com';` in the database after signing up.
An admin's own listings are approved automatically.

## Payments (Razorpay)
1. Create a free Razorpay account and open **Settings > API Keys** in test mode. Generate a key.
2. Put the key id (starts with `rzp_test_`) and secret in `backend/.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, then restart the backend.
3. If your database already exists, add the new payment columns once:
   `docker compose exec -T postgres psql -U roomly -d roomly < db/migrations/002_payments.sql`
   (A brand-new database gets them from `schema.sql`.)
4. Reserve a room, open **My bookings** and press **Pay**. Razorpay's test window opens. Use the test cards or
   the test UPI id `success@razorpay` from Razorpay's "test card details" page. No real money moves in test mode.

What happens behind the Pay button:
- The server creates a Razorpay order for the booking's exact total (the guest can't change the amount) and reuses it if asked twice.
- After payment, the website or app sends Razorpay's signature to `POST /payments/verify`. The server checks it with your secret
  before confirming. Nothing is confirmed on the browser's word alone.
- **Webhook (needed for real use):** if a guest pays and then closes the page, only the webhook can confirm the booking.
  In the Razorpay dashboard add a webhook to `https://YOUR-DOMAIN/payments/webhook`, events `payment.captured` and `order.paid`,
  and put its secret in `RAZORPAY_WEBHOOK_SECRET`. Locally you can skip it, or expose port 8000 with a tool like ngrok to try it.
- If a payment arrives after the 10-minute hold ended, the server tries to take the rooms again. If they are gone, it refunds in full.
- **Cancellation refunds:** a confirmed, paid booking cancelled at least `REFUND_FULL_HOURS` (default 48) before check-in is refunded in full;
  later cancellations get no refund. This is a business rule, so set the number that suits you. The "2 days" text on the My bookings
  page and in the app is written to match 48 hours; change it there too if you change the setting.
- If Razorpay refuses a refund, the payment row gets a note saying so and you refund it by hand in the dashboard.
- Before launch: switch to live keys, set `ALLOW_FAKE_CONFIRM=false`, and use the live webhook.

## How double-booking is prevented
`room_inventory` has one row per room type per night. Booking runs in one
transaction that locks those rows (`SELECT ... FOR UPDATE`), checks every night
has enough rooms, subtracts the rooms, and creates a booking with status `held`
for 10 minutes. Payment confirms it. Unpaid holds expire and give the rooms back.
Cancelling also gives the rooms back.

## API so far
- `POST /auth/register`, `POST /auth/login`
- Owners and admins (admins can manage every property; owners only their own):
  - Properties: `PATCH /owner/properties/{id}` (details and amenities), `POST /owner/properties` (admins may add `owner_id` to list on behalf of an owner,
    and their listings go live at once), `GET /owner/properties`, `GET /owner/properties/{id}`
  - Property photos: `POST /owner/properties/{id}/photos` (multipart, field `files`, several at once),
    `DELETE /owner/properties/{id}/photos/{photo_id}`
  - Rooms: `POST /owner/properties/{id}/room-types`, `PATCH /owner/room-types/{id}`,
    `DELETE /owner/room-types/{id}` (blocked once a room has bookings)
  - Room photos: `POST /owner/room-types/{id}/photos`, `DELETE /owner/room-types/{id}/photos/{photo_id}`
  - Availability and prices: `PUT` and `GET /owner/room-types/{id}/inventory`
  - Bookings: `GET /owner/bookings`
- Guest: `GET /amenities`, `GET /search`, `GET /properties/{id}`, `POST /bookings`,
  `GET /bookings/mine`, `POST /bookings/{id}/confirm` (dev-only test shortcut),
  `POST /bookings/{id}/cancel` (refunds per the rule above)
- Payments: `GET /payments/config`, `POST /payments/bookings/{id}/order`, `POST /payments/verify`, `POST /payments/webhook`
- Admin: `GET /admin/properties/pending`, `POST /admin/properties/{id}/approve`,
  `POST /admin/properties/{id}/reject`

## Photo uploads
JPG, PNG and WebP only, up to 5 MB each and 20 per property or room (change in `.env`). The file's real
content is checked, not just its name. Files are saved in `backend/uploads/` and served at `/uploads/...`
for development. For production, replace the two functions in `app/storage.py` with S3 or Cloudinary calls;
nothing else needs to change.

## Build order
1. Schema and auth (done)
2. Owner and admin side: properties, rooms, photos, prices, availability (done)
3. Search and booking with locking (done)
4. Razorpay payments (done); confirmation emails next
5. Next.js website: guest side and owner/admin dashboard done
6. Reviews, admin panel, deployment

## Travel vehicles

Vehicle operators (cars, vans, tempo travellers, mini buses, buses) sign up in the app with "Rent out vehicles", add vehicles with photos, a day price and fixed-price trips, and an admin approves them. Guests hire by the day or book a trip, pay the advance online (same 10-minute hold, same refund rule as rooms) and see the operator's phone number once confirmed.

Existing database: `docker compose -f docker-compose.prod.yml exec -T db psql -U roomly -d roomly < db/migrations/005_vehicles.sql`

## Manage my hotel (free tool for hosts)
Hosts get a **Manage my hotel** group in their panel (`/dashboard/hotel`): a room board, a guest register, staff with attendance,
and a monthly salary sheet. Records belong to one property and only the account that holds it can open them.
- Check-in and check-out are done from the room board. A walk-in guest checked in to a room takes one room of that type off sale
  on Hill Booker for each night (`hotel_guest_nights`, the same idea as `external_nights`); check-out, a shorter stay or deleting
  the guest gives the nights back. If no room was open online that night, the host is warned about a possible double booking.
- Guest address and ID proof can be noted. For Aadhaar only the last 4 digits are accepted and stored.
- ID proof photos (front and back) are kept in the database table `hotel_id_photos`, never in the public uploads folder, and are
  sent only to the logged-in account that holds the property. The website shrinks each photo to 1600 px before sending.
  Existing database: also run `db/migrations/034_hotel_id_photos.sql`.
- The guest's vehicle model and registration number can be noted (`db/migrations/035_hotel_guest_vehicle.sql`).
- Existing database: run `db/migrations/032_hotel_manager.sql`, then `db/migrations/033_hotel_checkin.sql`, e.g.
  `docker compose -f docker-compose.prod.yml exec -T db psql -U roomly -d roomly < db/migrations/033_hotel_checkin.sql`
- Part 3 (`backend/app/routes/hotel_ops.py`, `db/migrations/036_hotel_extras_expenses_stock.sql`):
  **Orders & extras** posts food, laundry, travel and other charges to a guest's bill from a one-tap price list, and
  `/dashboard/hotel/bill` prints the bill (room, extras, paid, balance; no GST lines). **Expenses** records spending by type with
  supplier bills still owed, and **Stock** tracks linen, toiletries, kitchen and cleaning items with a "buy more" level.

## Guest reviews: admin removal

- Admin panel → **Guest reviews** (`/dashboard/reviews`) lists every review, newest first, with the guest's name, phone and stay.
  **Remove** hides a review (abuse, spam, phone numbers) with a private reason; **Restore** brings it back.
- A removed review is kept in the database (`reviews.removed_at`), hidden from the property page and left out of the star rating.
  The guest can't post another review for the same stay.
- Existing database: run `db/migrations/038_review_removal.sql`.

## Page speed

- City photos in `frontend/public/cities`: `<city>.webp` (640 px, ~30 KB, shown on cards) and `<city>.jpg` (960 px, for sharing).
  The homepage now loads ~0.3 MB of photos instead of ~2.8 MB, and card photos are real `<img loading="lazy">`, so photos
  below the fold load only when scrolled to.
- Logos were shrunk (header logo 89 KB → 8 KB). `/cities/*` and the logos are cached by browsers for a week (`next.config.mjs`).
- Host photo uploads are shrunk in the browser before sending (longest side 1600 px, JPEG), in `apiUpload` (`frontend/lib/api.js`).
- Uploaded photos are shown as smaller WebP copies from `GET /img/<key>?w=320|640|960|1600` (`backend/app/routes/images.py`,
  needs Pillow). Each copy is made on first request and kept in `uploads/_thumbs`; nothing to run for old photos.
  The website uses `sized()` / `sizedSet()` from `frontend/lib/api.js`.
- Home page how-to videos show a thumbnail and load the YouTube player only when tapped (`components/LiteYouTube.jsx`).

## Home page design (Nov 2026)

- Photo hero (`public/hero/munnar-1200.webp` / `-720.webp`), search on top of it, then an owners strip ("List your property";
  the Deepavali line hides itself after `OWNER_OFFER_UNTIL` in `app/page.jsx`).
- "Explore the hills" cards show each region's height above sea level (`REGIONS` in `app/page.jsx`).
- Then property types, stays guests love, "Plan the whole trip" (plan my trip, cars, group tours), why Hill Booker,
  how-to videos, popular towns (only towns with a city page or a listed stay), and the owner band.
- Logged-out visitors see a "List your property" button in the header.
