from pathlib import Path
import pandas as pd

INTERNAL_COLUMNS = [
    "item", "references", "quantity", "value", "description", "manufacturer",
    "manufacturer_part_number", "footprint", "package", "supplier",
    "supplier_part_number", "mps_pn", "rs", "farnell", "mouser", "digikey",
    "buy", "no_mounted"
]

ALIASES = {
    "reference": "references",
    "designator": "references",
    "manufacturer part number": "manufacturer_part_number",
    "supplier part number": "supplier_part_number",
    "supplier  part number 1": "supplier_part_number",
    "supplier  part number 2": "mouser",
    "supplier 1": "supplier",
    "supplier 2": "supplier_2",
    "mps pn": "mps_pn",
    "nomounted": "no_mounted",
}

def _clean_cell(value) -> str:
    if pd.isna(value):
        return "-"
    text = str(value).strip()
    return text if text else "-"

def _clean_columns(columns):
    return [str(c).strip() for c in columns]

def _canonical(name: str) -> str:
    n = str(name).strip().lower()
    return ALIASES.get(n, n.replace(" ", "_"))

def _detect_header_row(path: Path, sheet_name=0) -> int:
    raw = pd.read_excel(path, sheet_name=sheet_name, header=None, nrows=40)
    for idx, row in raw.iterrows():
        vals = {str(v).strip().lower() for v in row.values if str(v) != "nan"}
        if {"item", "reference", "quantity"}.issubset(vals):
            return int(idx)
        if {"designator", "quantity"}.issubset(vals):
            return int(idx)
    raise ValueError("No se ha encontrado una cabecera BOM válida")

def _read_excel_robust(path: Path) -> pd.DataFrame:
    # Lee la primera hoja no vacía y detecta automáticamente la fila de cabecera.
    excel = pd.ExcelFile(path)
    last_error = None
    for sheet in excel.sheet_names:
        try:
            header_row = _detect_header_row(path, sheet)
            df = pd.read_excel(path, sheet_name=sheet, header=header_row)
            df.columns = _clean_columns(df.columns)
            df = df.dropna(how="all")
            if not df.empty:
                return df
        except Exception as exc:
            last_error = exc
    raise ValueError(f"No se pudo leer ninguna hoja BOM válida: {last_error}")

def _count_references(refs: str) -> int:
    if not refs or refs == "-":
        return 0
    return len([r.strip() for r in refs.replace(";", ",").split(",") if r.strip()])

def parse_bom(path: str | Path) -> tuple[str, list[dict]]:
    path = Path(path)
    df = _read_excel_robust(path)
    canonical_cols = {_canonical(c): c for c in df.columns}

    if "reference" in [c.lower().strip() for c in df.columns] or "references" in canonical_cols:
        detected = "format_altium_legacy"
    elif "designator" in [c.lower().strip() for c in df.columns] or "references" in canonical_cols:
        detected = "format_supplier_bom"
    else:
        raise ValueError("Formato de BOM no reconocido")

    out = pd.DataFrame()
    for col in INTERNAL_COLUMNS:
        source = canonical_cols.get(col)
        out[col] = df[source] if source else "-"

    # Formato Designator: Comment suele ser el valor visible del componente.
    if "comment" in canonical_cols and (out["value"].eq("-").all() or detected == "format_supplier_bom"):
        out["value"] = df[canonical_cols["comment"]]

    # Si no hay item, numeramos.
    if out["item"].eq("-").all():
        out["item"] = range(1, len(out) + 1)

    # Normalización de celdas.
    for col in out.columns:
        out[col] = out[col].apply(_clean_cell)

    out["quantity"] = pd.to_numeric(out["quantity"], errors="coerce").fillna(0).astype(int)
    out["item"] = pd.to_numeric(out["item"], errors="coerce").fillna(0).astype(int)

    # Limpieza: quitamos separadores raros o filas vacías.
    out = out[out["references"].ne("-")]
    out = out[~out["references"].str.startswith("____", na=False)]

    # Validación simple: si quantity viene 0, calculamos por referencias.
    for idx, row in out.iterrows():
        if row["quantity"] == 0:
            out.at[idx, "quantity"] = _count_references(row["references"])

    return detected, out.to_dict(orient="records")
