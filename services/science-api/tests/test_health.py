from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["mode"] == "rdkit-enabled"


def test_capabilities_honestly_reports_rdkit_and_deferred_openmm() -> None:
    response = client.get("/api/v1/capabilities")
    assert response.status_code == 200
    payload = response.json()
    adapters = {item["adapter"]: item for item in payload["adapters"]}
    assert adapters["rdkit"]["available"] is True
    assert adapters["rdkit"]["version"] is not None
    assert "validate_structure" in adapters["rdkit"]["supported_operations"]
    assert "conformer_etkdgv3" in adapters["rdkit"]["supported_operations"]
    assert adapters["openmm"]["available"] is False


def test_elements_baseline() -> None:
    response = client.get("/api/v1/elements")
    assert response.status_code == 200
    symbols = [el["symbol"] for el in response.json()]
    assert symbols == ["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"]

    missing = client.get("/api/v1/elements/Unobtanium")
    assert missing.status_code == 404
