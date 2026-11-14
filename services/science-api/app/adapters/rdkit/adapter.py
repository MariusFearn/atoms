from __future__ import annotations

import rdkit
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors

from app.models.contracts import (
    AtomInput,
    BondInput,
    BondOrderLiteral,
    ConformerResponse,
    DiagnosticItem,
    MolecularDescriptors,
    MoleculeInput,
    MolExportResponse,
    MolImportResponse,
    ValidationResponse,
)

MVP_BASELINE_ELEMENTS: tuple[str, ...] = (
    "H",
    "C",
    "N",
    "O",
    "F",
    "P",
    "S",
    "Cl",
    "Br",
    "I",
)

MVP_ELEMENT_SET = frozenset(MVP_BASELINE_ELEMENTS)

ALLOWED_ISOTOPES: dict[str, frozenset[int]] = {
    "H": frozenset({1, 2}),
    "C": frozenset({12, 13}),
    "N": frozenset({14, 15}),
    "O": frozenset({16, 17, 18}),
    "F": frozenset({19}),
    "P": frozenset({31}),
    "S": frozenset({32, 33, 34}),
    "Cl": frozenset({35, 37}),
    "Br": frozenset({79, 81}),
    "I": frozenset({127}),
}

RDKIT_ASSUMPTIONS = [
    "Explicit hydrogen representation: implicit hydrogens are disabled and never added silently.",
    "Closed-shell neutral or formally charged molecules only; radicals and multi-component mixtures are deferred.",
    "Aromaticity is preserved as a chemical atom and bond property across RDKit sanitization.",
]

RDKIT_LIMITATIONS = [
    "RDKit validation verifies topological valence and sanitization; it does not establish thermodynamic stability or force-field parameter coverage.",
    "Stereochemistry editing, coordination complexes, and disconnected multi-component systems are outside the approved MVP baseline.",
]

CONFORMER_ASSUMPTIONS = [
    "3D coordinates are generated using RDKit ETKDGv3 distance geometry with experimental torsion preferences.",
    "Coordinates are returned in angstroms (Å) for the input structure's exact connectivity.",
]

CONFORMER_LIMITATIONS = [
    "Generated conformers are NOT experimentally determined and are NOT force-field or quantum-chemically energy-minimized.",
    "A single distance-geometry sample does not represent a global potential-energy minimum or thermodynamic ensemble.",
]


class RdkitAdapterError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        http_status: int = 422,
        field_path: str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.field_path = field_path
        self.retryable = retryable


def rdkit_version() -> str:
    return rdkit.__version__


def _bond_pair_key(atom_a: str, atom_b: str) -> tuple[str, str]:
    return (atom_a, atom_b) if atom_a < atom_b else (atom_b, atom_a)


def _compute_explicit_formula(molecule: MoleculeInput) -> str:
    if not molecule.atoms:
        return "Empty"
    counts: dict[str, int] = {}
    for atom in molecule.atoms:
        counts[atom.element] = counts.get(atom.element, 0) + 1
    if "C" in counts:
        order = ["C"]
        if "H" in counts:
            order.append("H")
        order.extend(sorted(s for s in counts if s not in {"C", "H"}))
    else:
        order = sorted(counts)

    formula = "".join(f"{sym}{counts[sym] if counts[sym] > 1 else ''}" for sym in order)
    if molecule.net_charge != 0:
        abs_q = abs(molecule.net_charge)
        sign = "+" if molecule.net_charge > 0 else "-"
        formula += sign if abs_q == 1 else f"{abs_q}{sign}"
    return formula


def _check_integrity_and_baseline(molecule: MoleculeInput) -> tuple[str | None, list[DiagnosticItem]]:
    diagnostics: list[DiagnosticItem] = []
    seen_atom_ids: set[str] = set()

    for idx, atom in enumerate(molecule.atoms):
        if atom.id in seen_atom_ids:
            diagnostics.append(
                DiagnosticItem(
                    severity="error",
                    code="DUPLICATE_ATOM_ID",
                    message=f"Duplicate atom id '{atom.id}'.",
                    field_path=f"molecule.atoms[{idx}].id",
                    atom_ids=[atom.id],
                )
            )
        seen_atom_ids.add(atom.id)

        allowed_isos = ALLOWED_ISOTOPES.get(atom.element)
        if allowed_isos is not None and atom.isotope is not None and atom.isotope not in allowed_isos:
            diagnostics.append(
                DiagnosticItem(
                    severity="error",
                    code="INVALID_ISOTOPE",
                    message=f"Isotope {atom.isotope} does not match reference isotopes for {atom.element}.",
                    field_path=f"molecule.atoms[{idx}].isotope",
                    atom_ids=[atom.id],
                )
            )

    seen_bond_ids: set[str] = set()
    seen_pairs: set[tuple[str, str]] = set()
    for idx, bond in enumerate(molecule.bonds):
        if bond.id in seen_bond_ids:
            diagnostics.append(
                DiagnosticItem(
                    severity="error",
                    code="DUPLICATE_BOND_ID",
                    message=f"Duplicate bond id '{bond.id}'.",
                    field_path=f"molecule.bonds[{idx}].id",
                    bond_ids=[bond.id],
                )
            )
        seen_bond_ids.add(bond.id)

        if bond.atom_a == bond.atom_b:
            diagnostics.append(
                DiagnosticItem(
                    severity="error",
                    code="SELF_BOND",
                    message=f"Bond '{bond.id}' connects atom '{bond.atom_a}' to itself.",
                    field_path=f"molecule.bonds[{idx}]",
                    atom_ids=[bond.atom_a],
                    bond_ids=[bond.id],
                )
            )

        if bond.atom_a not in seen_atom_ids or bond.atom_b not in seen_atom_ids:
            diagnostics.append(
                DiagnosticItem(
                    severity="error",
                    code="DANGLING_BOND_REF",
                    message=f"Bond '{bond.id}' references missing atom ({bond.atom_a} -> {bond.atom_b}).",
                    field_path=f"molecule.bonds[{idx}]",
                    bond_ids=[bond.id],
                )
            )

        pair = _bond_pair_key(bond.atom_a, bond.atom_b)
        if pair in seen_pairs:
            diagnostics.append(
                DiagnosticItem(
                    severity="error",
                    code="DUPLICATE_BOND_PAIR",
                    message=f"Duplicate bond between '{bond.atom_a}' and '{bond.atom_b}'.",
                    field_path=f"molecule.bonds[{idx}]",
                    atom_ids=[bond.atom_a, bond.atom_b],
                    bond_ids=[bond.id],
                )
            )
        seen_pairs.add(pair)

    sum_formal = sum(a.formal_charge for a in molecule.atoms)
    if molecule.net_charge != sum_formal:
        diagnostics.append(
            DiagnosticItem(
                severity="error",
                code="NET_CHARGE_MISMATCH",
                message=f"Molecular net charge ({molecule.net_charge}) does not equal sum of formal charges ({sum_formal}).",
                field_path="molecule.net_charge",
            )
        )

    if diagnostics:
        return "integrity-error", diagnostics

    if not molecule.atoms:
        diagnostics.append(
            DiagnosticItem(
                severity="info",
                code="EMPTY_STRUCTURE",
                message="Structure has no atoms.",
                field_path="molecule.atoms",
            )
        )
        return "incomplete-draft", diagnostics

    unsupported_diags: list[DiagnosticItem] = []
    for idx, atom in enumerate(molecule.atoms):
        if atom.element not in MVP_ELEMENT_SET:
            unsupported_diags.append(
                DiagnosticItem(
                    severity="error",
                    code="UNSUPPORTED_ELEMENT",
                    message=f"Element '{atom.element}' is outside the approved MVP chemistry baseline ({', '.join(MVP_BASELINE_ELEMENTS)}).",
                    field_path=f"molecule.atoms[{idx}].element",
                    atom_ids=[atom.id],
                )
            )

    if unsupported_diags:
        return "unsupported-chemistry", unsupported_diags

    if molecule.spin_multiplicity is not None and molecule.spin_multiplicity != 1:
        return "unsupported-chemistry", [
            DiagnosticItem(
                severity="error",
                code="SPIN_MULTIPLICITY_DEFERRED",
                message=f"Open-shell spin multiplicity ({molecule.spin_multiplicity}) is deferred in MVP; only closed-shell singlets are supported.",
                field_path="molecule.spin_multiplicity",
            )
        ]

    return None, []


def _to_rdkit_bond_type(order: BondOrderLiteral) -> Chem.BondType:
    if order == 1:
        return Chem.BondType.SINGLE
    if order == 2:
        return Chem.BondType.DOUBLE
    if order == 3:
        return Chem.BondType.TRIPLE
    return Chem.BondType.AROMATIC


def _from_rdkit_bond_type(btype: Chem.BondType) -> BondOrderLiteral | None:
    if btype == Chem.BondType.SINGLE:
        return 1
    if btype == Chem.BondType.DOUBLE:
        return 2
    if btype == Chem.BondType.TRIPLE:
        return 3
    if btype == Chem.BondType.AROMATIC:
        return "aromatic"
    return None


def _build_unsanitized_rdkit_mol(molecule: MoleculeInput) -> tuple[Chem.Mol, dict[str, int]]:
    rw = Chem.RWMol()
    idx_by_id: dict[str, int] = {}
    conf = Chem.Conformer(len(molecule.atoms))

    for atom in molecule.atoms:
        rd_atom = Chem.Atom(atom.element)
        rd_atom.SetNoImplicit(True)
        rd_atom.SetFormalCharge(atom.formal_charge)
        if atom.isotope is not None:
            rd_atom.SetIsotope(atom.isotope)
        rd_atom.SetIsAromatic(atom.aromatic)
        rd_idx = rw.AddAtom(rd_atom)
        idx_by_id[atom.id] = rd_idx
        conf.SetAtomPosition(rd_idx, tuple(atom.position_angstrom))

    for bond in molecule.bonds:
        rd_bond_idx = rw.AddBond(
            idx_by_id[bond.atom_a],
            idx_by_id[bond.atom_b],
            _to_rdkit_bond_type(bond.order),
        )
        if bond.order == "aromatic":
            rw.GetBondWithIdx(rd_bond_idx - 1).SetIsAromatic(True)

    mol = rw.GetMol()
    mol.AddConformer(conf, assignId=True)
    return mol, idx_by_id


def _build_validated_rdkit_mol(
    molecule: MoleculeInput,
) -> tuple[Chem.Mol | None, ValidationResponse]:
    early_status, early_diags = _check_integrity_and_baseline(molecule)
    if early_status is not None:
        return None, ValidationResponse(
            structure_revision_id=molecule.revision_id,
            status=early_status,  # type: ignore[arg-type]
            ready_for_conformer_generation=False,
            ready_for_md=False,
            engine="RDKit",
            engine_version=rdkit_version(),
            assumptions=RDKIT_ASSUMPTIONS,
            limitations=RDKIT_LIMITATIONS,
            descriptors=None,
            diagnostics=early_diags,
        )

    mol, idx_by_id = _build_unsanitized_rdkit_mol(molecule)

    frags = Chem.GetMolFrags(mol)
    if len(frags) > 1:
        return None, ValidationResponse(
            structure_revision_id=molecule.revision_id,
            status="unsupported-chemistry",
            ready_for_conformer_generation=False,
            ready_for_md=False,
            engine="RDKit",
            engine_version=rdkit_version(),
            assumptions=RDKIT_ASSUMPTIONS,
            limitations=RDKIT_LIMITATIONS,
            descriptors=None,
            diagnostics=[
                DiagnosticItem(
                    severity="error",
                    code="MULTI_COMPONENT_DEFERRED",
                    message=f"Structure contains {len(frags)} disconnected components; multi-component systems are deferred in MVP.",
                    field_path="molecule.bonds",
                )
            ],
        )

    try:
        Chem.SanitizeMol(mol)
    except Exception as exc:
        return None, ValidationResponse(
            structure_revision_id=molecule.revision_id,
            status="invalid-valence",
            ready_for_conformer_generation=False,
            ready_for_md=False,
            engine="RDKit",
            engine_version=rdkit_version(),
            assumptions=RDKIT_ASSUMPTIONS,
            limitations=RDKIT_LIMITATIONS,
            descriptors=None,
            diagnostics=[
                DiagnosticItem(
                    severity="error",
                    code="RDKIT_SANITIZATION_FAILED",
                    message=f"RDKit chemical sanitization failed: {exc}",
                    field_path="molecule",
                )
            ],
        )

    # Enforce explicit-hydrogen closed-shell consistency and aromatic consistency
    id_by_idx = {v: k for k, v in idx_by_id.items()}
    post_diags: list[DiagnosticItem] = []
    has_aromatic_mismatch = False
    has_open_shell = False

    for atom_in in molecule.atoms:
        rd_atom = mol.GetAtomWithIdx(idx_by_id[atom_in.id])
        if rd_atom.GetIsAromatic() != atom_in.aromatic:
            has_aromatic_mismatch = True
            post_diags.append(
                DiagnosticItem(
                    severity="error",
                    code="AROMATIC_CONSISTENCY",
                    message=(
                        f"Atom '{atom_in.id}' ({atom_in.element}) aromatic flag ({atom_in.aromatic}) "
                        f"conflicts with RDKit aromatic perception ({rd_atom.GetIsAromatic()})."
                    ),
                    atom_ids=[atom_in.id],
                )
            )
        radicals = rd_atom.GetNumRadicalElectrons()
        if radicals > 0:
            has_open_shell = True
            post_diags.append(
                DiagnosticItem(
                    severity="warning",
                    code="OPEN_SHELL_OR_INCOMPLETE_VALENCE",
                    message=(
                        f"Atom '{atom_in.id}' ({atom_in.element}) has {radicals} unpaired radical electron(s) "
                        "under explicit-hydrogen rules. Add explicit hydrogens or adjust formal charge/bonds."
                    ),
                    atom_ids=[atom_in.id],
                )
            )

    if has_aromatic_mismatch or has_open_shell:
        return None, ValidationResponse(
            structure_revision_id=molecule.revision_id,
            status="invalid-valence" if has_aromatic_mismatch else "incomplete-draft",
            ready_for_conformer_generation=False,
            ready_for_md=False,
            engine="RDKit",
            engine_version=rdkit_version(),
            assumptions=RDKIT_ASSUMPTIONS,
            limitations=RDKIT_LIMITATIONS,
            descriptors=None,
            diagnostics=post_diags,
        )

    # Sanity-check explicit atom formula consistency
    explicit_formula = _compute_explicit_formula(molecule)
    mol_no_hs_formula = rdMolDescriptors.CalcMolFormula(mol)
    info_diags = [
        DiagnosticItem(
            severity="info",
            code="RDKIT_VALIDATION_PASSED",
            message=f"Validated closed-shell explicit-hydrogen structure ({explicit_formula}) with RDKit {rdkit_version()}.",
        )
    ]
    if mol_no_hs_formula != explicit_formula:
        info_diags.append(
            DiagnosticItem(
                severity="info",
                code="FORMULA_NOTATION_NOTE",
                message=f"Explicit formula '{explicit_formula}'; RDKit formula '{mol_no_hs_formula}'.",
            )
        )

    smiles = Chem.MolToSmiles(mol, canonical=True)
    try:
        inchikey: str | None = Chem.MolToInchiKey(mol) or None
    except Exception:
        inchikey = None

    descriptors = MolecularDescriptors(
        explicit_formula=explicit_formula,
        canonical_smiles=smiles,
        inchikey=inchikey,
        atom_count=mol.GetNumAtoms(),
        heavy_atom_count=sum(1 for a in mol.GetAtoms() if a.GetAtomicNum() > 1),
        bond_count=mol.GetNumBonds(),
        molecular_mass_u=round(float(Descriptors.MolWt(mol)), 6),
        exact_mass_u=round(float(rdMolDescriptors.CalcExactMolWt(mol)), 6),
        rotatable_bond_count=int(rdMolDescriptors.CalcNumRotatableBonds(mol)),
        ring_count=int(rdMolDescriptors.CalcNumRings(mol)),
        aromatic_atom_count=sum(1 for a in mol.GetAtoms() if a.GetIsAromatic()),
        hbd_count=int(rdMolDescriptors.CalcNumHBD(mol)),
        hba_count=int(rdMolDescriptors.CalcNumHBA(mol)),
        tpsa_angstrom2=round(float(rdMolDescriptors.CalcTPSA(mol)), 4),
    )

    _ = id_by_idx
    return mol, ValidationResponse(
        structure_revision_id=molecule.revision_id,
        status="valid-rdkit",
        ready_for_conformer_generation=True,
        ready_for_md=False,
        engine="RDKit",
        engine_version=rdkit_version(),
        assumptions=RDKIT_ASSUMPTIONS,
        limitations=RDKIT_LIMITATIONS,
        descriptors=descriptors,
        diagnostics=info_diags,
    )


def validate_molecule(molecule: MoleculeInput) -> ValidationResponse:
    _, response = _build_validated_rdkit_mol(molecule)
    return response


def generate_conformer(molecule: MoleculeInput, random_seed: int = 42) -> ConformerResponse:
    mol, report = _build_validated_rdkit_mol(molecule)
    if mol is None or not report.ready_for_conformer_generation:
        first_diag = report.diagnostics[0] if report.diagnostics else None
        raise RdkitAdapterError(
            first_diag.code if first_diag else "STRUCTURE_NOT_READY_FOR_CONFORMER",
            first_diag.message
            if first_diag
            else "Structure failed RDKit validation and is not eligible for conformer generation.",
            http_status=422,
            field_path=first_diag.field_path if first_diag else "molecule",
            retryable=False,
        )

    mol_copy = Chem.Mol(mol)
    mol_copy.RemoveAllConformers()
    params = AllChem.ETKDGv3()
    params.randomSeed = random_seed

    embed_status = AllChem.EmbedMolecule(mol_copy, params)
    if embed_status != 0 or mol_copy.GetNumConformers() == 0:
        raise RdkitAdapterError(
            "CONFORMER_EMBEDDING_FAILED",
            "RDKit ETKDGv3 could not embed a 3D conformer for this connectivity.",
            http_status=422,
            field_path="molecule",
            retryable=True,
        )

    conf = mol_copy.GetConformer(0)
    positions: dict[str, tuple[float, float, float]] = {}
    for idx, atom in enumerate(molecule.atoms):
        pos = conf.GetAtomPosition(idx)
        positions[atom.id] = (
            round(float(pos.x), 6),
            round(float(pos.y), 6),
            round(float(pos.z), 6),
        )

    return ConformerResponse(
        source_revision_id=molecule.revision_id,
        method="RDKit ETKDGv3 distance-geometry embedding",
        engine="RDKit",
        engine_version=rdkit_version(),
        random_seed=random_seed,
        energy_minimized=False,
        geometry_status="rdkit-conformer",
        distance_unit="angstrom",
        assumptions=CONFORMER_ASSUMPTIONS,
        limitations=CONFORMER_LIMITATIONS,
        positions_angstrom=positions,
    )


def export_mol_block(molecule: MoleculeInput) -> MolExportResponse:
    mol, report = _build_validated_rdkit_mol(molecule)
    if mol is None or report.status == "integrity-error" or report.status == "unsupported-chemistry":
        first_diag = report.diagnostics[0] if report.diagnostics else None
        raise RdkitAdapterError(
            first_diag.code if first_diag else "EXPORT_REJECTED",
            first_diag.message
            if first_diag
            else "Structure cannot be exported to MOL format.",
            http_status=422,
            field_path=first_diag.field_path if first_diag else "molecule",
        )

    mol.SetProp("_Name", molecule.name)
    mol_block = Chem.MolToMolBlock(mol, kekulize=False)
    warnings: list[str] = []
    if report.status != "valid-rdkit":
        warnings.append(
            f"Exported draft has validation status '{report.status}'."
        )

    return MolExportResponse(
        structure_revision_id=molecule.revision_id,
        engine="RDKit",
        engine_version=rdkit_version(),
        format="mol-v2000",
        mol_block=mol_block,
        warnings=warnings,
    )


def import_mol_block(mol_text: str, name: str | None = None) -> MolImportResponse:
    stripped = mol_text.strip()
    if not stripped:
        raise RdkitAdapterError(
            "EMPTY_MOL_INPUT",
            "MOL/SDF file content is empty.",
            http_status=422,
            field_path="mol_text",
        )

    if "$$$$" in mol_text:
        records = [chunk for chunk in mol_text.split("$$$$") if chunk.strip()]
        if len(records) > 1:
            raise RdkitAdapterError(
                "MULTI_RECORD_SDF_UNSUPPORTED",
                f"SDF contains {len(records)} molecule records; MVP supports single-structure SDF/MOL import only.",
                http_status=422,
                field_path="mol_text",
            )
        mol_block_to_parse = records[0] if records else mol_text
    else:
        mol_block_to_parse = mol_text

    mol = Chem.MolFromMolBlock(mol_block_to_parse, sanitize=False, removeHs=False)
    if mol is None:
        raise RdkitAdapterError(
            "INVALID_MOL_BLOCK",
            "Unable to parse MOL/SDF block. Ensure it is a valid V2000/V3000 structure.",
            http_status=422,
            field_path="mol_text",
        )

    # Check raw atom elements and stereo before sanitization so nothing is silently altered
    for idx, atom in enumerate(mol.GetAtoms()):
        symbol = atom.GetSymbol()
        if symbol not in MVP_ELEMENT_SET:
            raise RdkitAdapterError(
                "UNSUPPORTED_ELEMENT",
                f"Imported structure contains unsupported element '{symbol}' (MVP baseline: {', '.join(MVP_BASELINE_ELEMENTS)}).",
                http_status=422,
                field_path=f"mol_text.atoms[{idx}]",
            )
        isotope = atom.GetIsotope()
        if isotope != 0 and isotope not in ALLOWED_ISOTOPES.get(symbol, frozenset()):
            raise RdkitAdapterError(
                "INVALID_ISOTOPE",
                f"Imported atom {idx + 1} ({symbol}) has unsupported isotope mass number {isotope}.",
                http_status=422,
                field_path=f"mol_text.atoms[{idx}]",
            )
        if atom.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED:
            raise RdkitAdapterError(
                "STEREOCHEMISTRY_UNSUPPORTED",
                "Imported structure contains explicit tetrahedral stereochemistry flags, which are deferred in MVP (cannot discard stereochemistry).",
                http_status=422,
                field_path=f"mol_text.atoms[{idx}]",
            )

    for idx, bond in enumerate(mol.GetBonds()):
        if _from_rdkit_bond_type(bond.GetBondType()) is None:
            raise RdkitAdapterError(
                "UNSUPPORTED_BOND_TYPE",
                f"Imported bond {idx + 1} has unsupported bond type '{bond.GetBondType()}'.",
                http_status=422,
                field_path=f"mol_text.bonds[{idx}]",
            )
        if bond.GetStereo() != Chem.BondStereo.STEREONONE:
            raise RdkitAdapterError(
                "STEREOCHEMISTRY_UNSUPPORTED",
                "Imported structure contains explicit bond stereochemistry flags, which are deferred in MVP (cannot discard stereochemistry).",
                http_status=422,
                field_path=f"mol_text.bonds[{idx}]",
            )

    try:
        Chem.SanitizeMol(mol)
    except Exception as exc:
        raise RdkitAdapterError(
            "RDKIT_SANITIZATION_FAILED",
            f"Imported MOL/SDF structure failed RDKit chemical sanitization: {exc}",
            http_status=422,
            field_path="mol_text",
        ) from exc

    frags = Chem.GetMolFrags(mol)
    if len(frags) > 1:
        raise RdkitAdapterError(
            "MULTI_COMPONENT_DEFERRED",
            f"Imported structure has {len(frags)} disconnected components; multi-component systems are deferred in MVP.",
            http_status=422,
            field_path="mol_text",
        )

    for idx, atom in enumerate(mol.GetAtoms()):
        if atom.GetNumImplicitHs() > 0:
            raise RdkitAdapterError(
                "IMPLICIT_HYDROGENS_UNSUPPORTED",
                (
                    f"Imported atom {idx + 1} ({atom.GetSymbol()}) has {atom.GetNumImplicitHs()} implicit hydrogen(s). "
                    "MatterLab requires explicit hydrogen atoms and does not silently add hydrogens."
                ),
                http_status=422,
                field_path=f"mol_text.atoms[{idx}]",
            )
        if atom.GetNumRadicalElectrons() > 0:
            raise RdkitAdapterError(
                "RADICAL_UNSUPPORTED",
                f"Imported atom {idx + 1} ({atom.GetSymbol()}) has unpaired radical electrons; radicals are deferred in MVP.",
                http_status=422,
                field_path=f"mol_text.atoms[{idx}]",
            )

    if mol.GetNumConformers() == 0:
        raise RdkitAdapterError(
            "MISSING_COORDINATES",
            "Imported MOL/SDF block does not contain a coordinate block.",
            http_status=422,
            field_path="mol_text",
        )

    conf = mol.GetConformer(0)
    element_counts: dict[str, int] = {}
    atom_id_by_idx: dict[int, str] = {}
    atoms_out: list[AtomInput] = []

    for idx, atom in enumerate(mol.GetAtoms()):
        sym = atom.GetSymbol()
        element_counts[sym] = element_counts.get(sym, 0) + 1
        atom_id = f"{sym}{element_counts[sym]}"
        atom_id_by_idx[idx] = atom_id
        pos = conf.GetAtomPosition(idx)
        iso = atom.GetIsotope()
        atoms_out.append(
            AtomInput(
                id=atom_id,
                element=sym,
                isotope=iso if iso != 0 else None,
                position_angstrom=(
                    round(float(pos.x), 6),
                    round(float(pos.y), 6),
                    round(float(pos.z), 6),
                ),
                formal_charge=int(atom.GetFormalCharge()),
                aromatic=bool(atom.GetIsAromatic()),
            )
        )

    bonds_out: list[BondInput] = []
    for idx, bond in enumerate(mol.GetBonds()):
        order = _from_rdkit_bond_type(bond.GetBondType())
        assert order is not None
        bonds_out.append(
            BondInput(
                id=f"b{idx + 1}",
                atom_a=atom_id_by_idx[bond.GetBeginAtomIdx()],
                atom_b=atom_id_by_idx[bond.GetEndAtomIdx()],
                order=order,
            )
        )

    title_prop = mol.GetProp("_Name").strip() if mol.HasProp("_Name") else ""
    resolved_name = (name or title_prop or "Imported MOL Structure").strip()
    net_charge = sum(a.formal_charge for a in atoms_out)

    return MolImportResponse(
        engine="RDKit",
        engine_version=rdkit_version(),
        distance_unit="angstrom",
        molecule=MoleculeInput(
            id="imported-mol",
            name=resolved_name,
            revision_id="imported-mol-r1",
            atoms=atoms_out,
            bonds=bonds_out,
            net_charge=net_charge,
            spin_multiplicity=1,
        ),
        warnings=[],
    )
