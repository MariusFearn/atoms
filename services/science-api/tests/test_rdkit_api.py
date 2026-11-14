from __future__ import annotations

import math

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_water() -> dict:
    return {
        "id": "example-water",
        "name": "Water (H2O)",
        "revision_id": "example-water-r1",
        "net_charge": 0,
        "atoms": [
            {"id": "O1", "element": "O", "isotope": None, "position_angstrom": [0.0, 0.0, 0.0], "formal_charge": 0, "aromatic": False},
            {"id": "H1", "element": "H", "isotope": None, "position_angstrom": [0.757, 0.586, 0.0], "formal_charge": 0, "aromatic": False},
            {"id": "H2", "element": "H", "isotope": None, "position_angstrom": [-0.757, 0.586, 0.0], "formal_charge": 0, "aromatic": False},
        ],
        "bonds": [
            {"id": "b1", "atom_a": "O1", "atom_b": "H1", "order": 1},
            {"id": "b2", "atom_a": "O1", "atom_b": "H2", "order": 1},
        ],
    }


def make_co2() -> dict:
    return {
        "id": "example-co2",
        "name": "Carbon Dioxide (CO2)",
        "revision_id": "example-co2-r1",
        "net_charge": 0,
        "atoms": [
            {"id": "C1", "element": "C", "isotope": None, "position_angstrom": [0.0, 0.0, 0.0], "formal_charge": 0, "aromatic": False},
            {"id": "O1", "element": "O", "isotope": None, "position_angstrom": [-1.16, 0.0, 0.0], "formal_charge": 0, "aromatic": False},
            {"id": "O2", "element": "O", "isotope": None, "position_angstrom": [1.16, 0.0, 0.0], "formal_charge": 0, "aromatic": False},
        ],
        "bonds": [
            {"id": "b1", "atom_a": "C1", "atom_b": "O1", "order": 2},
            {"id": "b2", "atom_a": "C1", "atom_b": "O2", "order": 2},
        ],
    }


def make_methane() -> dict:
    return {
        "id": "example-methane",
        "name": "Methane (CH4)",
        "revision_id": "example-methane-r1",
        "net_charge": 0,
        "atoms": [
            {"id": "C1", "element": "C", "isotope": None, "position_angstrom": [0.0, 0.0, 0.0], "formal_charge": 0, "aromatic": False},
            {"id": "H1", "element": "H", "isotope": None, "position_angstrom": [0.629, 0.629, 0.629], "formal_charge": 0, "aromatic": False},
            {"id": "H2", "element": "H", "isotope": None, "position_angstrom": [-0.629, -0.629, 0.629], "formal_charge": 0, "aromatic": False},
            {"id": "H3", "element": "H", "isotope": None, "position_angstrom": [-0.629, 0.629, -0.629], "formal_charge": 0, "aromatic": False},
            {"id": "H4", "element": "H", "isotope": None, "position_angstrom": [0.629, -0.629, -0.629], "formal_charge": 0, "aromatic": False},
        ],
        "bonds": [
            {"id": "b1", "atom_a": "C1", "atom_b": "H1", "order": 1},
            {"id": "b2", "atom_a": "C1", "atom_b": "H2", "order": 1},
            {"id": "b3", "atom_a": "C1", "atom_b": "H3", "order": 1},
            {"id": "b4", "atom_a": "C1", "atom_b": "H4", "order": 1},
        ],
    }


def make_benzene() -> dict:
    r_cc = 1.397
    r_ch = 1.397 + 1.084
    atoms = []
    bonds = []
    for i in range(6):
        theta = i * math.pi / 3.0
        atoms.append(
            {
                "id": f"C{i + 1}",
                "element": "C",
                "isotope": None,
                "position_angstrom": [round(r_cc * math.cos(theta), 6), round(r_cc * math.sin(theta), 6), 0.0],
                "formal_charge": 0,
                "aromatic": True,
            }
        )
        atoms.append(
            {
                "id": f"H{i + 1}",
                "element": "H",
                "isotope": None,
                "position_angstrom": [round(r_ch * math.cos(theta), 6), round(r_ch * math.sin(theta), 6), 0.0],
                "formal_charge": 0,
                "aromatic": False,
            }
        )
    for i in range(6):
        nxt = (i + 1) % 6
        bonds.append({"id": f"bc{i + 1}", "atom_a": f"C{i + 1}", "atom_b": f"C{nxt + 1}", "order": "aromatic"})
        bonds.append({"id": f"bh{i + 1}", "atom_a": f"C{i + 1}", "atom_b": f"H{i + 1}", "order": 1})
    return {
        "id": "example-benzene",
        "name": "Benzene (C6H6)",
        "revision_id": "example-benzene-r1",
        "net_charge": 0,
        "atoms": atoms,
        "bonds": bonds,
    }


def test_validate_curated_reference_fixtures() -> None:
    expected = [
        (make_water(), "H2O", 3, 0),
        (make_co2(), "CO2", 3, 0),
        (make_methane(), "CH4", 5, 0),
        (make_benzene(), "C6H6", 12, 6),
    ]
    for mol, formula, atom_count, aromatic_atoms in expected:
        resp = client.post("/api/v1/molecules/validate", json={"molecule": mol})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "valid-rdkit"
        assert body["ready_for_conformer_generation"] is True
        assert body["descriptors"]["explicit_formula"] == formula
        assert body["descriptors"]["atom_count"] == atom_count
        assert body["descriptors"]["aromatic_atom_count"] == aromatic_atoms


def test_benzene_mol_round_trip_preserves_aromaticity_and_isotope() -> None:
    benzene = make_benzene()
    benzene["atoms"][0]["isotope"] = 13

    exp_resp = client.post("/api/v1/molecules/export/mol", json={"molecule": benzene})
    assert exp_resp.status_code == 200
    mol_block = exp_resp.json()["mol_block"]

    imp_resp = client.post("/api/v1/molecules/import/mol", json={"mol_text": mol_block})
    assert imp_resp.status_code == 200
    imported = imp_resp.json()["molecule"]
    assert len(imported["atoms"]) == 12
    assert len(imported["bonds"]) == 12
    assert imported["atoms"][0]["isotope"] == 13
    assert sum(1 for a in imported["atoms"] if a["aromatic"]) == 6
    assert sum(1 for b in imported["bonds"] if b["order"] == "aromatic") == 6

    reval = client.post("/api/v1/molecules/validate", json={"molecule": imported})
    assert reval.status_code == 200
    assert reval.json()["status"] == "valid-rdkit"
    assert reval.json()["descriptors"]["explicit_formula"] == "C6H6"


def test_conformer_generation_returns_seeded_coords_with_honest_metadata() -> None:
    benzene = make_benzene()
    resp1 = client.post(
        "/api/v1/molecules/conformers",
        json={"molecule": benzene, "random_seed": 123},
    )
    resp2 = client.post(
        "/api/v1/molecules/conformers",
        json={"molecule": benzene, "random_seed": 123},
    )
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    b1 = resp1.json()
    b2 = resp2.json()
    assert b1["source_revision_id"] == benzene["revision_id"]
    assert b1["energy_minimized"] is False
    assert b1["geometry_status"] == "rdkit-conformer"
    assert b1["distance_unit"] == "angstrom"
    assert b1["positions_angstrom"] == b2["positions_angstrom"]
    assert len(b1["positions_angstrom"]) == 12


def test_rejects_incomplete_draft_unsupported_element_and_implicit_h_import() -> None:
    # 1. Incomplete O-H must NOT silently add implicit hydrogen
    oh = make_water()
    oh["atoms"] = oh["atoms"][:2]
    oh["bonds"] = oh["bonds"][:1]
    resp_oh = client.post("/api/v1/molecules/validate", json={"molecule": oh})
    assert resp_oh.status_code == 200
    assert resp_oh.json()["status"] == "incomplete-draft"
    assert resp_oh.json()["ready_for_conformer_generation"] is False

    # Conformer request on incomplete draft returns structured 422
    conf_oh = client.post("/api/v1/molecules/conformers", json={"molecule": oh})
    assert conf_oh.status_code == 422
    assert conf_oh.json()["detail"]["code"] == "OPEN_SHELL_OR_INCOMPLETE_VALENCE"

    # 2. Unsupported element
    fe = make_water()
    fe["atoms"][0]["element"] = "Fe"
    resp_fe = client.post("/api/v1/molecules/validate", json={"molecule": fe})
    assert resp_fe.status_code == 200
    assert resp_fe.json()["status"] == "unsupported-chemistry"
    assert resp_fe.json()["diagnostics"][0]["code"] == "UNSUPPORTED_ELEMENT"

    # 3. Implicit hydrogen MOL block rejected rather than silently hydrogenated
    ethane_no_h = (
        "\n  RDKit          2D\n\n"
        "  2  1  0  0  0  0  0  0  0  0999 V2000\n"
        "    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n"
        "    1.5400    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n"
        "  1  2  1  0\n"
        "M  END\n"
    )
    imp_err = client.post("/api/v1/molecules/import/mol", json={"mol_text": ethane_no_h})
    assert imp_err.status_code == 422
    assert imp_err.json()["detail"]["code"] == "IMPLICIT_HYDROGENS_UNSUPPORTED"
