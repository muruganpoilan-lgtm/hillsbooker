import os
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db import pool
from .routes import admin, auth_routes, bookings, google_auth, invoices, owner, payments, public, upi, vehicles
from .storage import upload_root


log = logging.getLogger("roomly")


async def _expire_loop():
    """Every minute, put rooms from unpaid holds back on sale."""
    while True:
        try:
            freed = await asyncio.to_thread(bookings.expire_holds)
            freed += await asyncio.to_thread(vehicles.expire_holds)
            if freed:
                log.info("Released %s expired holds", freed)
        except Exception:
            log.exception("Could not release expired holds")
        await asyncio.sleep(60)


async def _purge_loop():
    """Once a day, permanently delete listings that were removed more than 30 days ago."""
    while True:
        try:
            n = await asyncio.to_thread(owner.purge_removed_properties)
            n += await asyncio.to_thread(vehicles.purge_removed_vehicles)
            if n:
                log.info("Deleted %s listings removed more than 30 days ago", n)
        except Exception:
            log.exception("Could not purge removed listings")
        await asyncio.sleep(24 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    task = asyncio.create_task(_expire_loop())
    purge_task = asyncio.create_task(_purge_loop())
    yield
    task.cancel()
    purge_task.cancel()
    pool.close()


app = FastAPI(title="Hill Booker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploaded photos are served from here in development. In production, serve them from S3 or a CDN.
app.mount("/uploads", StaticFiles(directory=upload_root()), name="uploads")

app.include_router(auth_routes.router)
app.include_router(google_auth.router)
app.include_router(owner.router)
app.include_router(public.router)
app.include_router(bookings.router)
app.include_router(payments.router)
app.include_router(upi.router)
app.include_router(admin.router)
app.include_router(invoices.router)
app.include_router(vehicles.public)
app.include_router(vehicles.operator)
app.include_router(vehicles.guest)


@app.get("/health")
def health():
    return {"ok": True}
