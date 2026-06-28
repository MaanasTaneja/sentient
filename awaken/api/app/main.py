import asyncio
import logging
import threading
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import hydra, models
from .db import SessionLocal, get_db, init_db
from .routers import entities, events, factions, npcs, quests, relationships, talk, worlds
from .seed import DEFAULT_WORLD_FILE, seed_demo

logger = logging.getLogger(__name__)
_seed_lock = threading.Lock()
_seed_state: dict[str, Any] = {"status": "idle", "error": None}

app = FastAPI(title="Awaken API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _set_seed_state(status: str, error: str | None = None) -> None:
    with _seed_lock:
        _seed_state["status"] = status
        _seed_state["error"] = error


def _get_seed_state() -> dict[str, Any]:
    with _seed_lock:
        return dict(_seed_state)


def _begin_seed() -> bool:
    with _seed_lock:
        if _seed_state["status"] == "seeding":
            return False
        _seed_state["status"] = "seeding"
        _seed_state["error"] = None
        return True


def _run_seed_job() -> None:
    if not _begin_seed():
        return

    try:
        hydra.validate_connection()
    except Exception as exc:
        logger.warning("HydraDB validation failed during seed (retry with POST /seed): %s", exc)
        _set_seed_state("error", str(exc))
        return

    db = SessionLocal()
    try:
        seed_demo(db)
    except Exception as exc:
        logger.warning("World seed failed (retry with POST /seed): %s", exc)
        _set_seed_state("error", str(exc))
    else:
        _set_seed_state("ready")
    finally:
        db.close()


async def _seed_in_background() -> None:
    await asyncio.to_thread(_run_seed_job)


@app.on_event("startup")
async def _startup() -> None:
    init_db()
    asyncio.create_task(_seed_in_background())


@app.get("/")
def root():
    return {"name": "Awaken", "docs": "/docs"}


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/world-definition")
def world_definition():
    from .world_definition import load_world_definition

    return load_world_definition(DEFAULT_WORLD_FILE).model_dump()


@app.get("/seed")
def get_seed(db: Session = Depends(get_db)):
    """Return the current world context (IDs only) without re-seeding."""
    state = _get_seed_state()
    if state["status"] == "seeding":
        return {"status": "seeding"}

    from .world_definition import load_world_definition
    definition = load_world_definition(DEFAULT_WORLD_FILE)
    world = db.query(models.World).filter_by(stable_key=definition.world.id).first()
    if world is None:
        return {"status": state["status"], "error": state["error"]}
    npc_rows = db.query(models.NPC).filter_by(world_id=world.id).all()
    faction_rows = db.query(models.Faction).filter_by(world_id=world.id).all()
    quest_rows = db.query(models.Quest).filter_by(world_id=world.id).all()
    return {
        "status": "ready",
        "world_id": world.id,
        "world_key": world.stable_key,
        "npcs": {n.stable_key: n.id for n in npc_rows},
        "factions": {f.stable_key: f.id for f in faction_rows},
        "quests": {q.stable_key: q.id for q in quest_rows},
    }


@app.post("/seed")
async def seed():
    state = _get_seed_state()
    if state["status"] == "seeding":
        return {"status": "seeding"}
    asyncio.create_task(_seed_in_background())
    return {"status": "seeding"}


app.include_router(worlds.router)
app.include_router(factions.router)
app.include_router(npcs.router)
app.include_router(relationships.router)
app.include_router(entities.router)
app.include_router(events.router)
app.include_router(quests.router)
app.include_router(talk.router)
