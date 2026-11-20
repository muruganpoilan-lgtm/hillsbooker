"""Plan my trip: the guest gives a place (or lets us suggest one), dates, people, budget and whether they need a cab.
We answer with rooms that are free on every night, cabs free on those days, ready-made packages, a day-by-day plan
and a rough cost. The guest can then book the room and cab themselves, or send the whole plan to Hill Booker,
where it lands in the admin's Enquiries list (kind 'trip') with a WhatsApp alert, like group tours."""
import math
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator

from .. import notify, ratelimit
from ..db import get_conn
from .enquiries import _email
from .packages import list_packages
from .public import search as search_rooms
from .vehicles import list_vehicles

router = APIRouter(prefix="/trips", tags=["trips"])

# Top-of-band nightly price for each budget choice (per room). None = no limit.
BUDGET_MAX = {"low": 2500, "mid": 5000, "high": 9000, "any": None}
BUDGET_LABEL = {"low": "Under ₹2,500 a night", "mid": "₹2,500 to ₹5,000 a night", "high": "₹5,000 to ₹9,000 a night", "any": "Any budget"}

# Places to see, best first. Edit freely: the day plan simply walks down each list.
SIGHTS = {
    "ooty": ["Government Botanical Garden", "Ooty Lake boating", "Doddabetta Peak", "Rose Garden", "Tea Factory and Tea Museum",
             "Pykara Lake and Falls", "Pine Forest", "Toy train ride to Coonoor", "Emerald Lake", "Avalanche Lake (forest permit)"],
    "coonoor": ["Sim's Park", "Dolphin's Nose viewpoint", "Lamb's Rock", "Highfield Tea Factory", "Catherine Falls viewpoint",
                "Toy train ride to Ooty"],
    "kotagiri": ["Kodanad Viewpoint", "Catherine Falls", "Longwood Shola forest walk", "Elk Falls", "Tea estate walk"],
    "munnar": ["Eravikulam National Park", "Tea Museum", "Mattupetty Dam", "Echo Point", "Kundala Lake", "Top Station",
               "Attukal Waterfalls", "Lakkam Waterfalls", "Blossom Park"],
    "kodaikanal": ["Kodai Lake boating and cycling", "Coaker's Walk", "Bryant Park", "Pillar Rocks", "Pine Forest",
                   "Guna Caves viewpoint", "Silver Cascade Falls", "Dolphin's Nose, Vattakanal", "Berijam Lake (forest permit)"],
    "valparai": ["Tea estate walk", "Sholayar Dam", "Nallamudi Poonjolai viewpoint", "Chinnakallar Falls", "Balaji Temple",
                 "Aliyar Dam and the 40 hairpin bends", "Monkey Falls", "Loam's viewpoint"],
    "coorg": ["Abbey Falls", "Raja's Seat", "Coffee estate walk", "Dubare Elephant Camp", "Namdroling Monastery (Golden Temple)",
              "Mandalpatti viewpoint", "Talacauvery", "Iruppu Falls"],
    "wayanad": ["Pookode Lake", "Edakkal Caves", "Banasura Sagar Dam", "Soochipara Falls", "Chembra Peak trek",
                "Kuruva Island", "Muthanga Wildlife Sanctuary"],
    "yercaud": ["Yercaud Lake boating", "Lady's Seat", "Pagoda Point", "Killiyur Falls", "Shevaroyan Temple", "Bears Cave",
                "Botanical Garden"],
    "thekkady": ["Periyar Lake boat ride", "Spice plantation tour", "Kathakali or Kalaripayattu show", "Bamboo rafting",
                 "Chellarkovil viewpoint", "Murikkady tea and cardamom estates"],
    "alleppey": ["Houseboat cruise on the backwaters", "Alappuzha Beach", "Kuttanad paddy fields", "Marari Beach",
                 "Pathiramanal Island"],
}
SIGHTS["kodagu"] = SIGHTS["coorg"]
SIGHTS["alappuzha"] = SIGHTS["alleppey"]

# What each interest suggests when the guest asks us to pick the place.
SUGGEST = {
    "nature": ["valparai", "munnar", "kotagiri", "wayanad"],
    "family": ["ooty", "kodaikanal", "yercaud", "munnar"],
    "couple": ["munnar", "kodaikanal", "coorg", "alleppey"],
    "adventure": ["wayanad", "coorg", "munnar", "thekkady"],
    "quiet": ["valparai", "kotagiri", "yercaud", "coonoor"],
}
DEFAULT_SUGGEST = ["ooty", "munnar", "kodaikanal", "valparai"]
NAMES = {"ooty": "Ooty", "coonoor": "Coonoor", "kotagiri": "Kotagiri", "munnar": "Munnar", "kodaikanal": "Kodaikanal",
         "valparai": "Valparai", "coorg": "Coorg", "wayanad": "Wayanad", "yercaud": "Yercaud", "thekkady": "Thekkady",
         "alleppey": "Alleppey"}
INTERESTS = set(SUGGEST)


def _rooms_for(adults: int, children: int) -> int:
    """A first guess at rooms: two adults a room, children stay with them."""
    return max(1, math.ceil(adults / 2))


def _day_plan(city: str, nights: int, from_city: str, cab: bool) -> list[dict]:
    """Arrival day, full days, departure day. Each full day gets up to three places from the list."""
    sights = list(SIGHTS.get(city.lower(), []))
    days = nights + 1
    plan = []
    pick = lambda n: [sights.pop(0) for _ in range(min(n, len(sights)))]
    for i in range(days):
        if i == 0:
            arrive = f"Travel from {from_city}" if from_city else "Arrive"
            items = [arrive + (" with your Hill Booker cab" if cab else ""), "Check in and rest"] + pick(1)
        elif i == days - 1:
            items = ["Breakfast and check out"] + pick(1) + [("Cab back to " + from_city) if (cab and from_city) else "Head home"]
        else:
            got = pick(3)
            items = got or ["Free day: walks, local food and shopping"]
        plan.append({"day": i + 1, "items": items})
    return plan


def _stays(city: str, ci: date, co: date, guests: int, rooms: int, max_price):
    res = search_rooms(city=city, name=None, check_in=ci, check_out=co, guests=guests, rooms=rooms, min_price=None,
                       max_price=max_price, property_type=None, min_rating=None, amenity=[], near_lat=None, near_lng=None,
                       sort="price")
    return res["results"]


@router.get("/plan")
def plan_trip(
    check_in: date,
    check_out: date,
    city: str = Query("", max_length=60),
    adults: int = Query(2, ge=1, le=30),
    children: int = Query(0, ge=0, le=20),
    budget: Literal["low", "mid", "high", "any"] = "any",
    cab: bool = False,
    from_city: str = Query("", max_length=60),
    interest: list[str] = Query([]),
):
    nights = (check_out - check_in).days
    if nights < 1:
        raise HTTPException(400, "Check-out must be after check-in")
    if nights > 14:
        raise HTTPException(400, "Plan up to 14 nights at a time")
    guests = adults + children
    rooms = _rooms_for(adults, children)
    max_price = BUDGET_MAX[budget]
    interests = [i for i in interest if i in INTERESTS][:5]
    city = city.strip()

    # No place chosen: try the places that fit their interests and keep the one with the most free stays.
    suggested = False
    alternatives = []
    if not city:
        suggested = True
        order = []
        for i in interests or ["_"]:
            for c in SUGGEST.get(i, DEFAULT_SUGGEST):
                if c not in order:
                    order.append(c)
        scored = []
        for c in order[:6]:
            found = _stays(c, check_in, check_out, guests, rooms, max_price)
            scored.append((len(found), c))
        scored.sort(key=lambda x: -x[0])
        city = NAMES[scored[0][1]]
        alternatives = [NAMES[c] for n, c in scored[1:4]]

    stays = _stays(city, check_in, check_out, guests, rooms, max_price)
    over_budget = False
    if not stays and max_price is not None:
        stays = _stays(city, check_in, check_out, guests, rooms, None)
        over_budget = bool(stays)
    for s in stays:
        s["stay_total"] = round(float(s["price_per_night"]) * nights * rooms)
    stays = stays[:4]

    cabs = []
    if cab:
        days = nights + 1
        for v in list_vehicles(city=city, kind=None, seats=guests, start=check_in, end=check_out)[:4]:
            v["trip_total"] = round(float(v["price_per_day"]) * days)
            cabs.append(v)

    packages = list_packages(city=city)[:3]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date + 2) AS d")
        earliest = cur.fetchone()["d"]

    est_stay = stays[0]["stay_total"] if stays else None
    est_cab = cabs[0]["trip_total"] if cabs else None
    return {
        "city": city,
        "suggested": suggested,
        "alternatives": alternatives,
        "nights": nights,
        "rooms": rooms,
        "guests": guests,
        "too_soon": check_in < earliest,
        "earliest": earliest,
        "over_budget": over_budget,
        "stays": stays,
        "cabs": cabs,
        "packages": packages,
        "days": _day_plan(city, nights, from_city.strip(), cab),
        "estimate": {"stay": est_stay, "cab": est_cab, "total": (est_stay or 0) + (est_cab or 0) if (est_stay or est_cab) else None},
    }


class TripRequestIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    city: str = Field(min_length=2, max_length=60)
    check_in: date
    check_out: date
    adults: int = Field(default=2, ge=1, le=30)
    children: int = Field(default=0, ge=0, le=20)
    budget: Literal["low", "mid", "high", "any"] = "any"
    cab: bool = False
    from_city: Optional[str] = Field(default=None, max_length=60)
    interests: list[str] = Field(default_factory=list, max_length=5)
    stay_name: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=1000)
    website: Optional[str] = None  # hidden field for bots

    @model_validator(mode="after")
    def check_dates(self):
        if self.check_out <= self.check_in:
            raise ValueError("Check-out must be after check-in")
        return self


@router.post("/request", status_code=201)
def send_trip(body: TripRequestIn, request: Request):
    """The guest wants Hill Booker to arrange the whole trip. Saved with the other enquiries; the team calls back."""
    if body.website:
        return {"ok": True}
    ratelimit.form_guard(request)
    phone = notify.wa_number(body.phone)
    if not phone:
        raise HTTPException(422, "Please enter a valid phone number")
    nights = (body.check_out - body.check_in).days
    lines = [
        f"Dates: {body.check_in:%d %b %Y} to {body.check_out:%d %b %Y} ({nights} night{'s' if nights != 1 else ''})",
        f"People: {body.adults} adult(s), {body.children} child(ren)",
        f"Cab needed: {'yes' if body.cab else 'no'}" + (f", from {body.from_city}" if body.from_city else ""),
    ]
    picked = [i for i in body.interests if i in INTERESTS]
    if picked:
        lines.append("Interests: " + ", ".join(picked))
    if body.stay_name:
        lines.append(f"Liked stay: {body.stay_name}")
    if body.notes:
        lines.append(f"Notes: {body.notes.strip()}")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM enquiries WHERE phone = %s AND created_at > now() - interval '1 hour'", (phone,))
        if cur.fetchone()["n"] >= 3:
            raise HTTPException(429, "We already have your trip request. We will call you soon")
        cur.execute(
            """INSERT INTO enquiries (kind, name, phone, email, destination, start_date, people, budget, notes)
               VALUES ('trip', %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (body.name.strip(), phone, body.email, body.city.strip(), body.check_in, body.adults + body.children,
             BUDGET_LABEL[body.budget], "\n".join(lines)),
        )
        row = cur.fetchone()
    notify.enquiry_in_background(row)
    _email(row)
    return {"ok": True}
