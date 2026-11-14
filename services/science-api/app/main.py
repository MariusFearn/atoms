from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.adapters.rdkit.adapter import (
    MVP_BASELINE_ELEMENTS,
    RdkitAdapterError,
    export_mol_block,
    generate_conformer,
    import_mol_block,
    rdkit_version,
    validate_molecule,
)
from app.models.contracts import (
    AdapterCapability,
    ApiErrorDetail,
    CapabilitiesResponse,
    ConformerRequest,
    ConformerResponse,
    ElementSummary,
    HealthResponse,
    MolExportRequest,
    MolExportResponse,
    MolImportRequest,
    MolImportResponse,
    ValidateMoleculeRequest,
    ValidationResponse,
)

API_VERSION = "0.1.0"

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


def _raise_http_error(exc: RdkitAdapterError) -> None:
    raise HTTPException(
        status_code=exc.http_status,
        detail=ApiErrorDetail(
            code=exc.code,
            message=exc.message,
            field_path=exc.field_path,
            retryable=exc.retryable,
        ).model_dump(),
    ) from exc


def create_app() -> FastAPI:
    app = FastAPI(
        title="MatterLab Science API",
        version=API_VERSION,
        description="Typed scientific engine boundary for MatterLab (RDKit enabled).",
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
            mode="rdkit-enabled",
        )

    @app.get("/api/v1/capabilities", response_model=CapabilitiesResponse)
    def get_capabilities() -> CapabilitiesResponse:
        return CapabilitiesResponse(
            api_version=API_VERSION,
            adapters=[
                AdapterCapability(
                    adapter="rdkit",
                    available=True,
                    version=rdkit_version(),
                    supported_elements=list(MVP_BASELINE_ELEMENTS),
                    supported_operations=[
                        "validate_structure",
                        "molecular_descriptors",
                        "conformer_etkdgv3",
                        "mol_v2000_import",
                        "mol_v2000_export",
                    ],
                    limitations=[
                        "Requires explicit hydrogen atoms and closed-shell single-component structures.",
                        "Stereochemistry editing, radicals, coordination complexes, and multi-component mixtures are deferred.",
                        "Generated ETKDGv3 conformers are not experimentally determined or energy-minimized.",
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
            detail=ApiErrorDetail(
                code="ELEMENT_NOT_FOUND",
                message=f"Element '{symbol}' is not in the approved MVP chemistry baseline.",
                field_path="symbol",
                retryable=False,
            ).model_dump(),
        )

    @app.post("/api/v1/molecules/validate", response_model=ValidationResponse)
    def post_validate_molecule(req: ValidateMoleculeRequest) -> ValidationResponse:
        return validate_molecule(req.molecule)

    @app.post("/api/v1/molecules/conformers", response_model=ConformerResponse)
    def post_generate_conformer(req: ConformerRequest) -> ConformerResponse:
        try:
            return generate_conformer(req.molecule, random_seed=req.random_seed)
        except RdkitAdapterError as exc:
            _raise_http_error(exc)

    @app.post("/api/v1/molecules/export/mol", response_model=MolExportResponse)
    def post_export_mol(req: MolExportRequest) -> MolExportResponse:
        try:
            return export_mol_block(req.molecule)
        except RdkitAdapterError as exc:
            _raise_http_error(exc)

    @app.post("/api/v1/molecules/import/mol", response_model=MolImportResponse)
    def post_import_mol(req: MolImportRequest) -> MolImportResponse:
        try:
            return import_mol_block(req.mol_text, name=req.name)
        except RdkitAdapterError as exc:
            _raise_http_error(exc)

    return app


app = create_app()
