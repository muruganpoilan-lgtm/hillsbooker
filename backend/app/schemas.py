from datetime import date

from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = None
    password: str = Field(min_length=8, max_length=100)
    role: str = Field(default="guest", pattern="^(guest|owner|operator)$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PropertyIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    type: str = Field(pattern="^(hotel|homestay|apartment|resort)$")
    description: str | None = None
    city: str = Field(min_length=1, max_length=80)
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    advance_percent: int = Field(default=100, ge=10, le=100)  # share paid online when booking
    amenity_ids: list[int] = []
    photo_urls: list[str] = []
    owner_id: str | None = None  # admins only: create the property on behalf of this owner


class PropertyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    type: str | None = Field(default=None, pattern="^(hotel|homestay|apartment|resort)$")
    description: str | None = None
    city: str | None = Field(default=None, min_length=1, max_length=80)
    address: str | None = None
    advance_percent: int | None = Field(default=None, ge=10, le=100)
    amenity_ids: list[int] | None = None


class RoomTypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    max_guests: int = Field(default=2, ge=1, le=20)
    base_price: float = Field(ge=0)
    total_rooms: int = Field(ge=1, le=500)


class RoomTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    max_guests: int | None = Field(default=None, ge=1, le=20)
    base_price: float | None = Field(default=None, ge=0)
    total_rooms: int | None = Field(default=None, ge=1, le=500)


class InventoryIn(BaseModel):
    start: date
    end: date  # last night to open, inclusive
    rooms_open: int = Field(ge=0)  # total rooms open for sale each night; rooms already booked are subtracted
    price: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def check_range(self):
        if self.end < self.start:
            raise ValueError("end must be on or after start")
        if (self.end - self.start).days > 366:
            raise ValueError("Set at most one year at a time")
        return self


class BookingIn(BaseModel):
    room_type_id: str
    check_in: date
    check_out: date
    rooms: int = Field(default=1, ge=1, le=10)
    guests: int = Field(default=1, ge=1, le=40)

    @model_validator(mode="after")
    def check_dates(self):
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        if (self.check_out - self.check_in).days > 30:
            raise ValueError("Stays are limited to 30 nights")
        if self.check_in < date.today():
            raise ValueError("check_in can't be in the past")
        return self


VEHICLE_KINDS = "^(car|suv|van|traveller|mini_bus|bus)$"


class VehicleIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    kind: str = Field(pattern=VEHICLE_KINDS)
    seats: int = Field(ge=1, le=80)
    ac: bool = True
    city: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    price_per_day: float = Field(ge=0, le=1_000_000)
    km_per_day: int | None = Field(default=None, ge=1, le=2000)
    extra_km_rate: float | None = Field(default=None, ge=0, le=1000)
    quantity: int = Field(default=1, ge=1, le=50)
    advance_percent: int = Field(default=100, ge=10, le=100)


class VehicleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: str | None = Field(default=None, pattern=VEHICLE_KINDS)
    seats: int | None = Field(default=None, ge=1, le=80)
    ac: bool | None = None
    city: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    price_per_day: float | None = Field(default=None, ge=0, le=1_000_000)
    km_per_day: int | None = Field(default=None, ge=1, le=2000)
    extra_km_rate: float | None = Field(default=None, ge=0, le=1000)
    quantity: int | None = Field(default=None, ge=1, le=50)
    advance_percent: int | None = Field(default=None, ge=10, le=100)


class TripIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    from_place: str | None = Field(default=None, max_length=80)
    to_place: str | None = Field(default=None, max_length=80)
    details: str | None = Field(default=None, max_length=1000)
    price: float = Field(ge=0, le=1_000_000)


class TripUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    from_place: str | None = Field(default=None, max_length=80)
    to_place: str | None = Field(default=None, max_length=80)
    details: str | None = Field(default=None, max_length=1000)
    price: float | None = Field(default=None, ge=0, le=1_000_000)
    active: bool | None = None


class VehicleBookingIn(BaseModel):
    vehicle_id: str
    trip_id: str | None = None          # set for a fixed-price trip; leave empty to hire by the day
    start_date: date
    end_date: date | None = None        # by the day only; a trip is one date
    count: int = Field(default=1, ge=1, le=20)
    passengers: int = Field(default=1, ge=1, le=200)
    pickup: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_dates(self):
        if self.start_date < date.today():
            raise ValueError("The date can't be in the past")
        if self.trip_id is None:
            if self.end_date is None:
                self.end_date = self.start_date
            if self.end_date < self.start_date:
                raise ValueError("end_date can't be before start_date")
            if (self.end_date - self.start_date).days >= 30:
                raise ValueError("Hire is limited to 30 days")
        else:
            self.end_date = self.start_date
        return self
