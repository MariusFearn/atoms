from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

API_VERSION = "0.1.0"


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    mode: Literal["prototype-scaffold"]


class AdapterCapability(BaseModel):
    adapter: str
    available: bool
    version: str | None
    supported_elements: list[str]
    supported_operations: list[str]
    limitations: list[str]


class CapabilitiesResponse(BaseModel):
    api_version: str
    adapters: list[AdapterCapability]


class ElementSummary(BaseModel):
    atomic_number: int
    symbol: str
    name: str
    standard_atomic_weight_u: float
    provenance: str


BASELINE_ELEMENTS: list[ElementSummary] = [
    ElementSummary(atomic_number=1, symbol="H", name="Hydrogen", standard_atomic_weight_u=1.008, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=6, symbol="C", name="Carbon", standard_atomic_weight_u=12.011, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=7, symbol="N", name="Nitrogen", standard_atomic_weight_u=14.007, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=8, symbol="O", name="Oxygen", standard_atomic_weight_u=15.999, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=9, symbol="F", name="Fluorine", standard_atomic_weight_u=18.998, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=15, symbol="P", name="Phosphorus", standard_atomic_weight_u=30.974, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=16, symbol="S", name="Sulfur", standard_atomic_weight_u=32.06, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=17, symbol="Cl", name="Chlorine", standard_atomic_weight_u=35.45, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=35, symbol="Br", name="Bromine", standard_atomic_weight_u=79.904, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
    ElementSummary(atomic_number=53, symbol="I", name="Iodine", standard_atomic_weight_u=126.90, provenance="IUPAC CIAAW 2021 abridged standard atomic weight"),
]


def create_app() -> FastAPI:
    app = FastAPI(
        title="MatterLab Science API",
        version=API_VERSION,
        description="Typed scientific engine boundary for MatterLab.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/v1/health", response_model=HealthResponse)
    def get_health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="matterlab-science-api",
            version=API_VERSION,
            mode="prototype-scaffold",
        )

    @app.get("/api/v1/capabilities", response_model=CapabilitiesResponse)
    def get_capabilities() -> CapabilitiesResponse:
        return CapabilitiesResponse(
            api_version=API_VERSION,
            adapters=[
                AdapterCapability(
                    adapter="rdkit",
                    available=False,
                    version=None,
                    supported_elements=["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"],
                    supported_operations=[],
                    limitations=[
                        "RDKit integration is scheduled for Milestone 3 and is not yet enabled in this prototype scaffold."
                    ],
                ),
                AdapterCapability(
                    adapter="openmm",
                    available=False,
                    version=None,
                    supported_elements=[],
                    supported_operations=[],
                    limitations=[
                        "Classical molecular dynamics via OpenMM is scheduled for Milestone 4."
                    ],
                ),
            ],
        )

    @app.get("/api/v1/elements", response_model=list[ElementSummary])
    def list_elements() -> list[ElementSummary]:
        return BASELINE_ELEMENTS

    @app.get("/api/v1/elements/{symbol}", response_model=ElementSummary)
    def get_element(symbol: str) -> ElementSummary:
        normalized = symbol.strip().capitalize()
        for el in BASELINE_ELEMENTS:
            if el.symbol == normalized:
                return el
        raise HTTPException(
            status_code=404,
            detail={
                "code": "ELEMENT_NOT_FOUND",
                "message": f"Element '{symbol}' is not in the approved MVP chemistry baseline.",
                "retryable": False,
            },
        )

    return app


app = create_app()
