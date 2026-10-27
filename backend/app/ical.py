"""Calendar (iCal) helpers for the channel manager. Standard library only.

Other booking sites (Airbnb, Booking.com, Agoda, MakeMyTrip, ...) share availability as .ics calendar links.
We read their links to block nights here, and publish our own link so they can block nights there."""
import ipaddress
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

MAX_BYTES = 2_000_000
HORIZON_DAYS = 365


class IcalError(Exception):
    """A problem the host can fix: a bad link, a site that refused us, a calendar we couldn't read."""


# ---------- reading a calendar ----------

def _unfold(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _to_date(value: str) -> date | None:
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", value.strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def parse_events(text: str) -> list[tuple[date, date]]:
    """Return (first night, day after last night) for every event that blocks time. Cancelled events are skipped."""
    if "BEGIN:VCALENDAR" not in text:
        raise IcalError("That link is not a calendar. Copy the iCal / .ics link from the other site")
    events: list[tuple[date, date]] = []
    cur: dict[str, str] | None = None
    for line in _unfold(text):
        up = line.upper()
        if up.startswith("BEGIN:VEVENT"):
            cur = {}
        elif up.startswith("END:VEVENT"):
            if cur and cur.get("STATUS", "").upper() != "CANCELLED" and "DTSTART" in cur:
                start = _to_date(cur["DTSTART"])
                end = _to_date(cur["DTEND"]) if "DTEND" in cur else None
                if start:
                    if not end or end <= start:
                        end = start + timedelta(days=1)  # a same-day or open-ended event blocks that one night
                    events.append((start, end))
            cur = None
        elif cur is not None and ":" in line:
            key, _, value = line.partition(":")
            cur[key.split(";")[0].upper()] = value
    return events


def nights_wanted(events: list[tuple[date, date]], today: date, total_rooms: int) -> dict[date, int]:
    """How many rooms each night the other sites have taken (one event = one room), within the next year."""
    last = today + timedelta(days=HORIZON_DAYS)
    counts: dict[date, int] = {}
    for start, end in events:
        day = max(start, today)
        while day < end and day < last:
            counts[day] = counts.get(day, 0) + 1
            day += timedelta(days=1)
    return {d: min(n, total_rooms) for d, n in counts.items()}


def plan_sync(wanted: dict[date, int], existing: dict[date, int], avail: dict[date, int], total_rooms: int) -> list[dict]:
    """Decide, night by night, how many rooms to take out of (or give back to) the open rooms.

    existing = rooms this link already took out earlier; avail = rooms open now (only nights that are open for sale).
    Never takes out more rooms than are free, and gives back exactly what was taken."""
    plan = []
    for day in sorted(set(wanted) | set(existing)):
        want = wanted.get(day, 0)
        old = existing.get(day, 0)
        if day in avail:
            applied = min(want, avail[day] + old)
            new_avail = min(avail[day] + old - applied, total_rooms)
        else:
            applied, new_avail = 0, None  # night is not open for sale, nothing to take out
        plan.append({"day": day, "wanted": want, "applied": applied, "new_avail": new_avail})
    return plan


# ---------- publishing our calendar ----------

def sold_out_ranges(days: list[date]) -> list[tuple[date, date]]:
    """Group sold-out nights into (first night, day after last night) ranges."""
    out: list[tuple[date, date]] = []
    for d in sorted(set(days)):
        if out and out[-1][1] == d:
            out[-1] = (out[-1][0], d + timedelta(days=1))
        else:
            out.append((d, d + timedelta(days=1)))
    return out


def build_ics(token: str, room_label: str, ranges: list[tuple[date, date]]) -> str:
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hill Booker//Channel manager//EN", "CALSCALE:GREGORIAN",
             f"X-WR-CALNAME:Hill Booker - {room_label}"]
    for start, end in ranges:
        lines += ["BEGIN:VEVENT", f"UID:{token[:12]}-{start:%Y%m%d}@hillbooker.com", f"DTSTAMP:{stamp}",
                  f"DTSTART;VALUE=DATE:{start:%Y%m%d}", f"DTEND;VALUE=DATE:{end:%Y%m%d}",
                  "SUMMARY:Not available (Hill Booker)", "TRANSP:OPAQUE", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


# ---------- fetching a link safely ----------

def _check_host(url: str) -> None:
    """Only public https links. Stops the server being used to reach our own network."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise IcalError("The calendar link must start with https://")
    if parts.port not in (None, 443):
        raise IcalError("The calendar link must use the normal https port")
    try:
        infos = socket.getaddrinfo(parts.hostname, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise IcalError("We couldn't find that website. Check the link")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise IcalError("That link points to a private address, so it can't be used")


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _check_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_calendar(url: str) -> str:
    _check_host(url)
    opener = urllib.request.build_opener(_SafeRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": "HillBooker-ChannelSync/1.0", "Accept": "text/calendar, */*"})
    try:
        with opener.open(req, timeout=15) as res:
            raw = res.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as e:
        raise IcalError(f"The other site refused the link (error {e.code}). Check that the link is still valid")
    except (urllib.error.URLError, TimeoutError, OSError):
        raise IcalError("We couldn't reach that link. Try again in a few minutes")
    if len(raw) > MAX_BYTES:
        raise IcalError("That calendar is too large")
    return raw.decode("utf-8", errors="replace")
