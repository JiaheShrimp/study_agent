import os
import json
import random
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/spinner", tags=["spinner"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SPINNER_FILE = os.path.join(DATA_DIR, "spinners.json")


def _read() -> list[dict]:
    if not os.path.exists(SPINNER_FILE):
        return []
    with open(SPINNER_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _write(data: list[dict]):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SPINNER_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class SpinnerItem(BaseModel):
    label: str


class SpinnerCreate(BaseModel):
    name: str
    items: list[str]


class Spinner(BaseModel):
    id: str
    name: str
    items: list[str]


@router.get("", response_model=list[Spinner])
def list_spinners():
    return _read()


@router.post("", response_model=Spinner, status_code=201)
def create_spinner(body: SpinnerCreate):
    spinners = _read()
    spinner = {
        "id": str(random.randint(10**9, 10**10)),
        "name": body.name,
        "items": body.items,
    }
    spinners.append(spinner)
    _write(spinners)
    return spinner


@router.put("/{spinner_id}", response_model=Spinner)
def update_spinner(spinner_id: str, body: SpinnerCreate):
    spinners = _read()
    for s in spinners:
        if s["id"] == spinner_id:
            s["name"] = body.name
            s["items"] = body.items
            _write(spinners)
            return s
    raise HTTPException(status_code=404, detail="not found")


@router.delete("/{spinner_id}", status_code=204)
def delete_spinner(spinner_id: str):
    spinners = _read()
    spinners = [s for s in spinners if s["id"] != spinner_id]
    _write(spinners)


@router.post("/{spinner_id}/spin")
def spin(spinner_id: str):
    spinners = _read()
    for s in spinners:
        if s["id"] == spinner_id:
            if not s["items"]:
                raise HTTPException(status_code=400, detail="no items")
            return {"result": random.choice(s["items"])}
    raise HTTPException(status_code=404, detail="not found")
