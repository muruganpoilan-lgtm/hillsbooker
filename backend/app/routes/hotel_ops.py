"""Manage my hotel, part 3: extras on the room bill (food, laundry, travel desk), expenses and supplier dues, and stock.

Same privacy rule as hotel.py: every record belongs to one property, and only the account that holds it can open it.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import get_conn
from .hotel import MAX_MONEY, ZERO, _clean, _mine, _month, _next_month, _text, _today, _xlsx, host

router = APIRouter(prefix="/hotel", tags=["manage my hotel"])

ExtraKind = Literal["food", "laundry", "travel", "other"]
EXTRA_NAMES = {"food": "Food and drinks", "laundry": "Laundry", "travel": "Travel desk", "other": "Other"}
ExpenseKind = Literal["groceries", "electricity", "water", "gas", "repairs", "laundry", "supplies", "fuel", "rent", "other"]
EXPENSE_NAMES = {"groceries": "Groceries", "electricity": "Electricity", "water": "Water", "gas": "Gas", "repairs": "Repairs",
                 "laundry": "Laundry", "supplies": "Supplies", "fuel": "Fuel", "rent": "Rent", "other": "Other"}
PayMethod = Literal["cash", "upi", "bank", "card"]
StockKind = Literal["linen", "toiletries", "kitchen", "cleaning", "other"]
STOCK_NAMES = {"linen": "Linen", "toiletries": "Toiletries", "kitchen": "Kitchen", "cleaning": "Cleaning", "other": "Other"}
MoveReason = Literal["purchase", "used", "damaged", "correction"]
MAX_MENU, MAX_STOCK = 300, 500
MAX_QTY = Decimal("1000000")


# ---------- price list for extras ----------

class MenuIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    category: ExtraKind = "food"
    price: Decimal = Field(ge=0, le=MAX_MONEY, decimal_places=2)


class MenuUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    category: ExtraKind | None = None
    price: Decimal | None = Field(default=None, ge=0, le=MAX_MONEY, decimal_places=2)


def _my_row(cur, table: str, row_id, user: dict, what: str) -> dict:
    """A row of a table that has property_id, checked against the signed-in host. The table name is fixed in the code."""
    cur.execute(f"SELECT * FROM {table} WHERE id = %s", (str(row_id),))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, f"{what} not found")
    _mine(cur, row["property_id"], user)
    return row


def _menu(cur, property_id) -> list[dict]:
    cur.execute("SELECT id, name, category, price FROM hotel_menu_items WHERE property_id = %s ORDER BY category, lower(name)", (str(property_id),))
    return cur.fetchall()


@router.post("/{property_id}/menu", status_code=201)
def add_menu_item(property_id: UUID, body: MenuIn, user: dict = Depends(host)):
    name = _clean(body.name)
    if not name:
        raise HTTPException(400, "Give the item a name")
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute("SELECT count(*) AS n FROM hotel_menu_items WHERE property_id = %s", (str(property_id),))
        if cur.fetchone()["n"] >= MAX_MENU:
            raise HTTPException(400, f"The price list can have up to {MAX_MENU} items")
        cur.execute(
            "INSERT INTO hotel_menu_items (property_id, name, category, price) VALUES (%s, %s, %s, %s) RETURNING id",
            (str(property_id), name, body.category, body.price),
        )
        return {"id": cur.fetchone()["id"]}


@router.patch("/menu/{item_id}")
def update_menu_item(item_id: UUID, body: MenuUpdate, user: dict = Depends(host)):
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "name" in changes:
        changes["name"] = _clean(changes["name"])
        if not changes["name"]:
            raise HTTPException(400, "Give the item a name")
    if not changes:
        raise HTTPException(400, "Nothing to change")
    with get_conn() as conn, conn.cursor() as cur:
        _my_row(cur, "hotel_menu_items", item_id, user, "Item")
        sets = ", ".join(f"{col} = %s" for col in changes)  # column names come from the model, never from the request
        cur.execute(f"UPDATE hotel_menu_items SET {sets} WHERE id = %s", (*changes.values(), str(item_id)))
    return {"id": str(item_id), "updated": list(changes)}


@router.delete("/menu/{item_id}")
def delete_menu_item(item_id: UUID, user: dict = Depends(host)):
    """Removes the item from the price list. Charges already on guests' bills keep their own name and price."""
    with get_conn() as conn, conn.cursor() as cur:
        _my_row(cur, "hotel_menu_items", item_id, user, "Item")
        cur.execute("DELETE FROM hotel_menu_items WHERE id = %s", (str(item_id),))
    return {"deleted": str(item_id)}


# ---------- extras posted to a guest's bill ----------

class ChargeIn(BaseModel):
    kind: Literal["walkin", "hillbooker"]  # whose bill: a direct guest, or a Hill Booker booking
    target_id: UUID
    name: str = Field(min_length=1, max_length=60)
    category: ExtraKind = "food"
    qty: int = Field(default=1, ge=1, le=999)
    unit_price: Decimal = Field(ge=0, le=MAX_MONEY, decimal_places=2)
    charged_on: date | None = None
    note: str | None = Field(default=None, max_length=200)


_STAYING = """
  SELECT 'walkin' AS kind, g.id, g.name, r.label AS room, g.check_in, g.check_out,
         (SELECT COALESCE(SUM(c.amount), 0) FROM hotel_charges c WHERE c.guest_id = g.id) AS extras,
         g.total_amount - g.paid_amount AS room_balance
    FROM hotel_guests g LEFT JOIN hotel_rooms r ON r.id = g.room_id
   WHERE g.property_id = %(p)s AND g.checked_out_at IS NULL AND g.check_in <= %(today)s AND g.check_out >= %(today)s
  UNION ALL
  SELECT 'hillbooker', b.id, u.name, r.label, b.check_in, b.check_out,
         (SELECT COALESCE(SUM(c.amount), 0) FROM hotel_charges c WHERE c.booking_id = b.id),
         b.total_amount - COALESCE(b.advance_amount, b.total_amount) - COALESCE(e.collected, 0)
    FROM bookings b JOIN users u ON u.id = b.user_id
    LEFT JOIN hotel_booking_extras e ON e.booking_id = b.id
    LEFT JOIN hotel_rooms r ON r.id = e.room_id
   WHERE b.property_id = %(p)s AND b.status = 'confirmed' AND e.checked_out_at IS NULL
     AND b.check_in <= %(today)s AND b.check_out >= %(today)s
"""


@router.get("/{property_id}/extras")
def extras_board(property_id: UUID, day: date | None = None, user: dict = Depends(host)):
    """Everything the Orders and extras page needs: guests staying now, the price list, and the extras posted on one day."""
    today = _today()
    day = day or today
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute(_STAYING + " ORDER BY 4 NULLS LAST, 3", {"p": str(property_id), "today": today})
        staying = cur.fetchall()
        for g in staying:
            g["balance"] = Decimal(g["room_balance"]) + Decimal(g["extras"])
        cur.execute(
            """SELECT c.id, c.name, c.category, c.qty, c.unit_price, c.amount, c.charged_on, c.note,
                      CASE WHEN c.guest_id IS NOT NULL THEN 'walkin' ELSE 'hillbooker' END AS kind,
                      COALESCE(c.guest_id, c.booking_id) AS target_id, COALESCE(g.name, u.name) AS guest,
                      COALESCE(gr.label, er.label) AS room
               FROM hotel_charges c
               LEFT JOIN hotel_guests g ON g.id = c.guest_id LEFT JOIN hotel_rooms gr ON gr.id = g.room_id
               LEFT JOIN bookings b ON b.id = c.booking_id LEFT JOIN users u ON u.id = b.user_id
               LEFT JOIN hotel_booking_extras e ON e.booking_id = b.id LEFT JOIN hotel_rooms er ON er.id = e.room_id
               WHERE c.property_id = %s AND c.charged_on = %s ORDER BY c.created_at DESC""",
            (str(property_id), day),
        )
        charges = cur.fetchall()
        menu = _menu(cur, property_id)
    return {"today": today, "day": day, "staying": staying, "menu": menu, "charges": charges,
            "day_total": sum((Decimal(c["amount"]) for c in charges), ZERO)}


def _charge_target(cur, kind: str, target_id, user: dict) -> tuple[str, str]:
    """Checks the guest or booking is this host's. Returns (property_id, column)."""
    if kind == "walkin":
        cur.execute("SELECT property_id FROM hotel_guests WHERE id = %s", (str(target_id),))
        row, col = cur.fetchone(), "guest_id"
    else:
        cur.execute("SELECT property_id, status FROM bookings WHERE id = %s", (str(target_id),))
        row, col = cur.fetchone(), "booking_id"
        if row and row["status"] != "confirmed":
            raise HTTPException(409, "Only confirmed bookings can have extras")
    if not row:
        raise HTTPException(404, "Guest not found")
    _mine(cur, row["property_id"], user)
    return str(row["property_id"]), col


@router.post("/{property_id}/charges", status_code=201)
def add_charge(property_id: UUID, body: ChargeIn, user: dict = Depends(host)):
    name = _clean(body.name)
    if not name:
        raise HTTPException(400, "Say what the charge is for")
    on = body.charged_on or _today()
    if on > _today() + timedelta(days=1):
        raise HTTPException(400, "The date is in the future")
    amount = body.unit_price * body.qty
    if amount > MAX_MONEY:
        raise HTTPException(400, "That amount is too large")
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        pid, col = _charge_target(cur, body.kind, body.target_id, user)
        if pid != str(property_id):
            raise HTTPException(400, "That guest is not in this property")
        cur.execute(
            f"""INSERT INTO hotel_charges (property_id, {col}, name, category, qty, unit_price, amount, charged_on, note)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (pid, str(body.target_id), name, body.category, body.qty, body.unit_price, amount, on, _clean(body.note)),
        )
        return {"id": cur.fetchone()["id"], "amount": amount}


@router.delete("/charges/{charge_id}")
def delete_charge(charge_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        _my_row(cur, "hotel_charges", charge_id, user, "Charge")
        cur.execute("DELETE FROM hotel_charges WHERE id = %s", (str(charge_id),))
    return {"deleted": str(charge_id)}


def _bill(kind: str, target_id, user: dict) -> dict:
    """The guest's full bill: the room, each extra, what was paid and what is left."""
    with get_conn() as conn, conn.cursor() as cur:
        _, col = _charge_target(cur, kind, target_id, user)
        if kind == "walkin":
            cur.execute(
                """SELECT g.name, g.phone, g.address, g.check_in, g.check_out, g.people, r.label AS room, rt.name AS room_type,
                          g.total_amount AS room_total, 0::numeric AS paid_online, g.paid_amount AS paid_here,
                          p.name AS hotel, p.city, p.address AS hotel_address, NULL AS invoice_no
                   FROM hotel_guests g JOIN properties p ON p.id = g.property_id
                   LEFT JOIN hotel_rooms r ON r.id = g.room_id LEFT JOIN room_types rt ON rt.id = r.room_type_id
                   WHERE g.id = %s""",
                (str(target_id),),
            )
        else:
            cur.execute(
                """SELECT u.name, u.phone, e.address, b.check_in, b.check_out, b.guests AS people, r.label AS room, rt.name AS room_type,
                          b.total_amount AS room_total, COALESCE(b.advance_amount, b.total_amount) AS paid_online,
                          COALESCE(e.collected, 0) AS paid_here, p.name AS hotel, p.city, p.address AS hotel_address, b.invoice_no
                   FROM bookings b JOIN users u ON u.id = b.user_id JOIN properties p ON p.id = b.property_id
                   JOIN room_types rt ON rt.id = b.room_type_id
                   LEFT JOIN hotel_booking_extras e ON e.booking_id = b.id LEFT JOIN hotel_rooms r ON r.id = e.room_id
                   WHERE b.id = %s""",
                (str(target_id),),
            )
        bill = cur.fetchone()
        cur.execute(
            f"SELECT id, name, category, qty, unit_price, amount, charged_on FROM hotel_charges WHERE {col} = %s ORDER BY charged_on, created_at",
            (str(target_id),),
        )
        bill["charges"] = cur.fetchall()
    bill["kind"] = kind
    bill["nights"] = (bill["check_out"] - bill["check_in"]).days
    bill["extras"] = sum((Decimal(c["amount"]) for c in bill["charges"]), ZERO)
    bill["total"] = Decimal(bill["room_total"]) + bill["extras"]
    bill["paid"] = Decimal(bill["paid_online"]) + Decimal(bill["paid_here"])
    bill["balance"] = bill["total"] - bill["paid"]
    bill["today"] = _today()
    return bill


@router.get("/guests/{guest_id}/bill")
def guest_bill(guest_id: UUID, user: dict = Depends(host)):
    return _bill("walkin", guest_id, user)


@router.get("/bookings/{booking_id}/bill")
def booking_bill(booking_id: UUID, user: dict = Depends(host)):
    return _bill("hillbooker", booking_id, user)


# ---------- expenses and supplier dues ----------

class ExpenseIn(BaseModel):
    spent_on: date | None = None
    category: ExpenseKind
    amount: Decimal = Field(gt=0, le=MAX_MONEY, decimal_places=2)
    supplier: str | None = Field(default=None, max_length=80)
    method: PayMethod | None = None
    paid: bool = True
    note: str | None = Field(default=None, max_length=300)


class ExpenseUpdate(BaseModel):
    spent_on: date | None = None
    category: ExpenseKind | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=MAX_MONEY, decimal_places=2)
    supplier: str | None = Field(default=None, max_length=80)
    method: PayMethod | None = None
    paid: bool | None = None
    note: str | None = Field(default=None, max_length=300)


def _expense_day(day: date) -> None:
    if day > _today() + timedelta(days=1):
        raise HTTPException(400, "The date is in the future")
    if day.year < 2000:
        raise HTTPException(400, "Check the date")


def _load_expenses(cur, property_id, month: date) -> dict:
    args = {"p": str(property_id), "m": month, "next": _next_month(month)}
    cur.execute(
        """SELECT id, spent_on, category, amount, supplier, method, paid, paid_on, note FROM hotel_expenses
           WHERE property_id = %(p)s AND spent_on >= %(m)s AND spent_on < %(next)s ORDER BY spent_on DESC, created_at DESC""",
        args,
    )
    rows = cur.fetchall()
    # Bills from any month that are still owed to suppliers.
    cur.execute(
        """SELECT id, spent_on, category, amount, supplier, note FROM hotel_expenses
           WHERE property_id = %(p)s AND NOT paid ORDER BY spent_on""",
        args,
    )
    dues = cur.fetchall()
    cur.execute(
        """SELECT COALESCE(SUM(sp.amount), 0) AS paid FROM hotel_salary_payments sp JOIN hotel_staff s ON s.id = sp.staff_id
           WHERE s.property_id = %(p)s AND sp.paid_on >= %(m)s AND sp.paid_on < %(next)s""",
        args,
    )
    salary = cur.fetchone()["paid"]
    by_cat: dict[str, Decimal] = {}
    for r in rows:
        by_cat[r["category"]] = by_cat.get(r["category"], ZERO) + Decimal(r["amount"])
    spent = sum(by_cat.values(), ZERO)
    return {
        "expenses": rows, "dues": dues,
        "totals": {
            "spent": spent,
            "paid": sum((Decimal(r["amount"]) for r in rows if r["paid"]), ZERO),
            "due_all": sum((Decimal(d["amount"]) for d in dues), ZERO),
            "salary_paid": salary,
            "with_salary": spent + Decimal(salary),
            "by_category": [{"category": k, "amount": v} for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1])],
        },
    }


@router.get("/{property_id}/expenses")
def list_expenses(property_id: UUID, month: str | None = None, user: dict = Depends(host)):
    m = _month(month)
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        out = _load_expenses(cur, property_id, m)
    return {"month": f"{m:%Y-%m}", **out}


@router.post("/{property_id}/expenses", status_code=201)
def add_expense(property_id: UUID, body: ExpenseIn, user: dict = Depends(host)):
    on = body.spent_on or _today()
    _expense_day(on)
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute(
            """INSERT INTO hotel_expenses (property_id, spent_on, category, amount, supplier, method, paid, paid_on, note)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (str(property_id), on, body.category, body.amount, _clean(body.supplier), body.method if body.paid else None, body.paid,
             on if body.paid else None, _clean(body.note)),
        )
        return {"id": cur.fetchone()["id"]}


@router.patch("/expenses/{expense_id}")
def update_expense(expense_id: UUID, body: ExpenseUpdate, user: dict = Depends(host)):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Nothing to change")
    for col in ("spent_on", "category", "amount", "paid"):
        if col in changes and changes[col] is None:
            raise HTTPException(400, f"{col.replace('_', ' ').capitalize()} can't be empty")
    if "spent_on" in changes:
        _expense_day(changes["spent_on"])
    for col in ("supplier", "note"):
        if col in changes:
            changes[col] = _clean(changes[col])
    with get_conn() as conn, conn.cursor() as cur:
        old = _my_row(cur, "hotel_expenses", expense_id, user, "Expense")
        if "paid" in changes and changes["paid"] != old["paid"]:  # paying a supplier's bill records the day it was paid
            changes["paid_on"] = _today() if changes["paid"] else None
            if not changes["paid"]:
                changes["method"] = None
        sets = ", ".join(f"{col} = %s" for col in changes)  # column names come from the model, never from the request
        cur.execute(f"UPDATE hotel_expenses SET {sets} WHERE id = %s", (*changes.values(), str(expense_id)))
    return {"id": str(expense_id), "updated": list(changes)}


@router.delete("/expenses/{expense_id}")
def delete_expense(expense_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        _my_row(cur, "hotel_expenses", expense_id, user, "Expense")
        cur.execute("DELETE FROM hotel_expenses WHERE id = %s", (str(expense_id),))
    return {"deleted": str(expense_id)}


@router.get("/{property_id}/expenses.xlsx")
def expenses_xlsx(property_id: UUID, month: str | None = None, user: dict = Depends(host)):
    m = _month(month)
    with get_conn() as conn, conn.cursor() as cur:
        prop = _mine(cur, property_id, user)
        out = _load_expenses(cur, property_id, m)
    t = out["totals"]
    rows = [[r["spent_on"], EXPENSE_NAMES[r["category"]], _text(r["supplier"]), float(r["amount"]), "Paid" if r["paid"] else "Not paid yet",
             (r["method"] or "").upper() if r["method"] == "upi" else (r["method"] or "").capitalize(), _text(r["note"])] for r in out["expenses"]]
    rows.append(["", "Total", "", float(t["spent"]), "", "", ""])
    cats = [[EXPENSE_NAMES[c["category"]], float(c["amount"])] for c in t["by_category"]]
    cats += [["Salary and advances paid (from the Salary page)", float(t["salary_paid"])], ["Total with salary", float(t["with_salary"])]]
    return _xlsx(
        f"{prop['name']}: expenses for {m:%B %Y}",
        "Amounts in rupees. 'Not paid yet' is a bill still owed to the supplier.",
        [
            {"name": "Expenses", "headers": ["Date", "Type", "Supplier or shop", "Amount", "Status", "Paid by", "Note"], "rows": rows,
             "money": (4,), "dates": (1,), "widths": {2: 18, 3: 28, 5: 16, 7: 40}, "total_row": True},
            {"name": "By type", "headers": ["Type", "Amount"], "rows": cats, "money": (2,), "widths": {1: 48}, "total_row": True},
            {"name": "Owed to suppliers", "headers": ["Bill date", "Type", "Supplier or shop", "Amount", "Note"],
             "rows": [[d["spent_on"], EXPENSE_NAMES[d["category"]], _text(d["supplier"]), float(d["amount"]), _text(d["note"])] for d in out["dues"]],
             "money": (4,), "dates": (1,), "widths": {2: 18, 3: 28, 5: 40}},
        ],
        f"expenses-{m:%Y-%m}.xlsx",
    )


# ---------- stock ----------

class StockIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    category: StockKind = "other"
    unit: str = Field(default="pieces", min_length=1, max_length=20)
    qty: Decimal = Field(default=ZERO, ge=0, le=MAX_QTY, decimal_places=2)
    low_level: Decimal = Field(default=ZERO, ge=0, le=MAX_QTY, decimal_places=2)
    note: str | None = Field(default=None, max_length=200)


class StockUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    category: StockKind | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    low_level: Decimal | None = Field(default=None, ge=0, le=MAX_QTY, decimal_places=2)
    note: str | None = Field(default=None, max_length=200)


class StockMoveIn(BaseModel):
    change: Decimal = Field(ge=-MAX_QTY, le=MAX_QTY, decimal_places=2)  # plus = stock came in, minus = stock went out
    reason: MoveReason
    note: str | None = Field(default=None, max_length=200)


def _stock(cur, property_id) -> list[dict]:
    cur.execute(
        """SELECT id, name, category, unit, qty, low_level, note, (low_level > 0 AND qty <= low_level) AS low
           FROM hotel_stock_items WHERE property_id = %s ORDER BY category, lower(name)""",
        (str(property_id),),
    )
    return cur.fetchall()


@router.get("/{property_id}/stock")
def list_stock(property_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        items = _stock(cur, property_id)
    return {"items": items, "low": sum(1 for i in items if i["low"])}


@router.post("/{property_id}/stock", status_code=201)
def add_stock_item(property_id: UUID, body: StockIn, user: dict = Depends(host)):
    name, unit = _clean(body.name), _clean(body.unit)
    if not name or not unit:
        raise HTTPException(400, "Give the item a name and a unit")
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute("SELECT count(*) AS n FROM hotel_stock_items WHERE property_id = %s", (str(property_id),))
        if cur.fetchone()["n"] >= MAX_STOCK:
            raise HTTPException(400, f"The stock list can have up to {MAX_STOCK} items")
        cur.execute(
            """INSERT INTO hotel_stock_items (property_id, name, category, unit, qty, low_level, note)
               VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING id""",
            (str(property_id), name, body.category, unit, body.qty, body.low_level, _clean(body.note)),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(409, f"{name} is already in your stock list")
        if body.qty > 0:
            cur.execute(
                "INSERT INTO hotel_stock_moves (item_id, change, reason, qty_after, note, moved_on) VALUES (%s, %s, 'correction', %s, 'Opening stock', %s)",
                (str(row["id"]), body.qty, body.qty, _today()),
            )
        return {"id": row["id"]}


@router.patch("/stock/{item_id}")
def update_stock_item(item_id: UUID, body: StockUpdate, user: dict = Depends(host)):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Nothing to change")
    for col in ("name", "category", "unit", "low_level"):
        if col in changes and changes[col] is None:
            raise HTTPException(400, f"{col.replace('_', ' ').capitalize()} can't be empty")
    for col in ("name", "unit", "note"):
        if col in changes:
            changes[col] = _clean(changes[col])
            if col != "note" and not changes[col]:
                raise HTTPException(400, f"{col.capitalize()} can't be empty")
    with get_conn() as conn, conn.cursor() as cur:
        old = _my_row(cur, "hotel_stock_items", item_id, user, "Item")
        if "name" in changes:
            cur.execute(
                "SELECT 1 FROM hotel_stock_items WHERE property_id = %s AND lower(name) = lower(%s) AND id <> %s",
                (str(old["property_id"]), changes["name"], str(item_id)),
            )
            if cur.fetchone():
                raise HTTPException(409, f"{changes['name']} is already in your stock list")
        sets = ", ".join(f"{col} = %s" for col in changes)  # column names come from the model, never from the request
        cur.execute(f"UPDATE hotel_stock_items SET {sets} WHERE id = %s", (*changes.values(), str(item_id)))
    return {"id": str(item_id), "updated": list(changes)}


@router.delete("/stock/{item_id}")
def delete_stock_item(item_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        _my_row(cur, "hotel_stock_items", item_id, user, "Item")
        cur.execute("DELETE FROM hotel_stock_items WHERE id = %s", (str(item_id),))
    return {"deleted": str(item_id)}


@router.post("/stock/{item_id}/move", status_code=201)
def move_stock(item_id: UUID, body: StockMoveIn, user: dict = Depends(host)):
    """Stock came in (plus) or went out (minus). The count can never go below zero."""
    if body.change == 0:
        raise HTTPException(400, "Give a quantity")
    with get_conn() as conn, conn.cursor() as cur:
        _my_row(cur, "hotel_stock_items", item_id, user, "Item")
        cur.execute("SELECT qty, name, unit FROM hotel_stock_items WHERE id = %s FOR UPDATE", (str(item_id),))
        item = cur.fetchone()
        after = Decimal(item["qty"]) + body.change
        if after < 0:
            raise HTTPException(400, f"Only {float(item['qty']):g} {item['unit']} of {item['name']} in stock")
        if after > MAX_QTY:
            raise HTTPException(400, "That quantity is too large")
        cur.execute("UPDATE hotel_stock_items SET qty = %s WHERE id = %s", (after, str(item_id)))
        cur.execute(
            "INSERT INTO hotel_stock_moves (item_id, change, reason, qty_after, note, moved_on) VALUES (%s, %s, %s, %s, %s, %s)",
            (str(item_id), body.change, body.reason, after, _clean(body.note), _today()),
        )
    return {"id": str(item_id), "qty": after}


@router.get("/stock/{item_id}/moves")
def stock_history(item_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        _my_row(cur, "hotel_stock_items", item_id, user, "Item")
        cur.execute(
            "SELECT id, change, reason, qty_after, note, moved_on FROM hotel_stock_moves WHERE item_id = %s ORDER BY created_at DESC LIMIT 30",
            (str(item_id),),
        )
        return cur.fetchall()


@router.get("/{property_id}/stock.xlsx")
def stock_xlsx(property_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        prop = _mine(cur, property_id, user)
        items = _stock(cur, property_id)
    return _xlsx(
        f"{prop['name']}: stock on {_today():%d %b %Y}",
        "'Buy more' marks items at or below the level you set.",
        [{"name": "Stock", "headers": ["Item", "Type", "In stock", "Unit", "Buy more at", "Status", "Note"],
          "rows": [[_text(i["name"]), STOCK_NAMES[i["category"]], float(i["qty"]), _text(i["unit"]), float(i["low_level"]),
                    "Buy more" if i["low"] else "OK", _text(i["note"])] for i in items],
          "widths": {1: 28, 2: 16, 7: 36}}],
        f"stock-{_today():%Y%m%d}.xlsx",
    )
