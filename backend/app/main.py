from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from tempfile import NamedTemporaryFile
from fastapi.responses import FileResponse
from pathlib import Path
from datetime import datetime
from io import BytesIO
import os
import pandas as pd

import shutil
import xlwt

from .bom_parser import parse_bom
from .database import init_db, get_connection
from .models import BomUploadResponse

from passlib.context import CryptContext
from jose import jwt


app = FastAPI(title="PCB BOM Assembly API")

UPLOAD_REWORKS = Path("uploads/reworks")
UPLOAD_REWORKS.mkdir(parents=True, exist_ok=True)

PCB_DEFAULT_CHECKLIST = [
    ("Project Setup", "Project setup completed"),
    ("System Definition", "Define block diagram"),
    ("System Definition", "Split into functional blocks"),
    ("Component Preparation", "Collect all required components"),
    ("Component Preparation", "Record MPN for each component"),
    ("Schematic", "Power rails ordered"),
    ("Schematic", "Add decoupling capacitors"),
    ("Schematic", "Generate netlist without errors"),
    ("Schematic", "BOM checked"),
    ("PCB Layout", "Select PCB stackup/template"),
    ("PCB Layout", "Import footprints"),
    ("PCB Layout", "Create board outline"),
    ("PCB Layout", "DRC check without errors"),
    ("Release & Manufacturing", "Generate Gerbers"),
    ("Release & Manufacturing", "Check Gerber errors"),
    ("Waiting PCB Team", "Fabrication ordered"),
    ("Waiting PCB Team", "PCB received"),
    ("Waiting LAB", "Assembly requested"),
    ("Waiting LAB", "BOM received"),
    ("Waiting LAB", "Mounted"),
]

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

init_db()

# ============================================================
# AUTH / USERS
# ============================================================

SECRET_KEY = os.getenv(
    "PCB_MANAGER_SECRET_KEY",
    "CAMBIA_ESTA_CLAVE_SUPER_SECRETA"
)
ALGORITHM = "HS256"

pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto"
)


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str):
    return pwd_context.verify(password, hashed)


def create_token(user):
    payload = {
        "user_id": user["id"],
        "username": user["username"],
        "role": user["role"]
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://bcn-vm-labbom:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def split_reference_designators(refs: str):
    if not refs:
        return []

    refs = refs.replace(";", ",")
    refs = refs.replace(" ", "")

    return [
        r.strip()
        for r in refs.split(",")
        if r.strip()
    ]

def save_tmp_upload(file: UploadFile) -> str:
    suffix = Path(file.filename or "bom.xlsx").suffix

    if suffix.lower() not in [".xlsx", ".xls", ".csv"]:
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Usa .xlsx, .xls o .csv",
        )

    with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        return tmp.name


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/bom/upload", response_model=BomUploadResponse)
async def upload_bom(file: UploadFile = File(...)):
    tmp_path = save_tmp_upload(file)
    detected_format, items = parse_bom(tmp_path)

    return {
        "detected_format": detected_format,
        "total_items": len(items),
        "items": items,
    }


@app.post("/api/bom/check")
async def check_bom(file: UploadFile = File(...)):
    tmp_path = save_tmp_upload(file)
    detected_format, items = parse_bom(tmp_path)

    checked_items = []
    missing_mps = 0
    missing_mpn = 0
    ok_items = 0

    for it in items:
        mps_pn = str(it.get("mps_pn", "")).strip()
        mpn = str(it.get("manufacturer_part_number", "")).strip()

        has_mps = mps_pn not in ["", "-", "nan", "None"]
        has_mpn = mpn not in ["", "-", "nan", "None"]

        errors = []

        if not has_mps:
            errors.append("Missing MPS PN")
            missing_mps += 1

        if not has_mpn:
            errors.append("Missing Manufacturer Part Number")
            missing_mpn += 1

        if has_mps and has_mpn:
            ok_items += 1

        checked_items.append({
            "item": it.get("item"),
            "references": it.get("references"),
            "quantity": it.get("quantity"),
            "value": it.get("value"),
            "description": it.get("description"),
            "manufacturer": it.get("manufacturer"),
            "manufacturer_part_number": it.get("manufacturer_part_number"),
            "mps_pn": it.get("mps_pn"),
            "footprint": it.get("footprint"),
            "package": it.get("package"),
            "errors": errors,
            "is_ok": len(errors) == 0,
        })

    return {
        "detected_format": detected_format,
        "total_items": len(items),
        "ok_items": ok_items,
        "missing_mps_pn": missing_mps,
        "missing_manufacturer_part_number": missing_mpn,
        "items": checked_items,
    }


# ============================================================
# ENGINEERING PROJECTS
# ============================================================

@app.post("/api/engineering-projects")
def create_engineering_project(
    project_name: str = Form(...),
    project_code: str = Form(...),
    description: str = Form(""),
):
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO engineering_projects (
                project_name,
                project_code,
                description,
                status
            )
            VALUES (?, ?, ?, ?)
        """, (
            project_name,
            project_code,
            description,
            "active",
        ))

        project_id = cur.lastrowid
        conn.commit()

    except Exception as exc:
        conn.rollback()
        conn.close()

        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(
                status_code=400,
                detail="Ya existe un proyecto con ese código",
            )

        raise HTTPException(status_code=400, detail=str(exc))

    conn.close()

    return {
        "id": project_id,
        "project_name": project_name,
        "project_code": project_code,
        "description": description,
        "status": "active",
    }


@app.get("/api/engineering-projects")
def list_engineering_projects():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            ep.*,
            COUNT(DISTINCT p.id) AS bom_count,
            COUNT(DISTINCT r.id) AS rework_count
        FROM engineering_projects ep
        LEFT JOIN projects p
            ON p.engineering_project_id = ep.id
        LEFT JOIN reworks r
            ON r.engineering_project_id = ep.id
        GROUP BY ep.id
        ORDER BY ep.created_at DESC
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return rows


@app.get("/api/engineering-projects/{project_id}")
def get_engineering_project(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT *
        FROM engineering_projects
        WHERE id = ?
    """, (project_id,))

    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Proyecto no encontrado",
        )

    return dict(row)


@app.delete("/api/engineering-projects/{project_id}")
def delete_engineering_project(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id
        FROM engineering_projects
        WHERE id = ?
    """, (project_id,))

    row = cur.fetchone()

    if not row:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Proyecto no encontrado",
        )

    cur.execute("""
        DELETE FROM engineering_projects
        WHERE id = ?
    """, (project_id,))

    conn.commit()
    conn.close()

    return {
        "deleted": True,
        "project_id": project_id,
    }


# ============================================================
# BOMS / ASSEMBLY PROJECTS
# ============================================================

@app.post("/api/projects")
async def create_project(
    engineering_project_id: int = Form(...),
    pcb_name: str = Form(...),
    pcb_code: str = Form(...),
    file: UploadFile = File(...),
):
    tmp_path = save_tmp_upload(file)
    detected_format, items = parse_bom(tmp_path)

    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO projects (
                engineering_project_id,
                pcb_name,
                pcb_code,
                bom_filename,
                detected_format,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            engineering_project_id,
            pcb_name,
            pcb_code,
            file.filename,
            detected_format,
            "active",
        ))

        project_id = cur.lastrowid

        for it in items:
            cur.execute("""
                INSERT INTO project_bom_items (
                    project_id,
                    item,
                    reference_designators,
                    quantity,
                    value,
                    description,
                    manufacturer,
                    manufacturer_part_number,
                    footprint,
                    package,
                    supplier,
                    supplier_part_number,
                    mps_pn,
                    rs,
                    farnell,
                    mouser,
                    digikey,
                    buy,
                    no_mounted,
                    status,
                    comment,
                    side
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                project_id,
                it.get("item"),
                it.get("references"),
                it.get("quantity"),
                it.get("value"),
                it.get("description"),
                it.get("manufacturer"),
                it.get("manufacturer_part_number"),
                it.get("footprint"),
                it.get("package"),
                it.get("supplier"),
                it.get("supplier_part_number"),
                it.get("mps_pn"),
                it.get("rs"),
                it.get("farnell"),
                it.get("mouser"),
                it.get("digikey"),
                it.get("buy"),
                it.get("no_mounted"),
                "pending",
                "",
                "UNKNOWN",
            ))

            bom_item_id = cur.lastrowid

            references = split_reference_designators(
                it.get("references") or ""
            )

            for ref in references:
                cur.execute("""
                    INSERT INTO project_bom_references (
                        project_id,
                        bom_item_id,
                        reference_designator,
                        side,
                        status,
                        comment
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    project_id,
                    bom_item_id,
                    ref,
                    "UNKNOWN",
                    "pending",
                    ""
                ))

        conn.commit()

    except Exception as exc:
        conn.rollback()

        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(
                status_code=400,
                detail="Ya existe una BOM con ese código",
            )

        raise HTTPException(status_code=400, detail=str(exc))

    finally:
        conn.close()

    return {
        "project_id": project_id,
        "pcb_name": pcb_name,
        "pcb_code": pcb_code,
        "bom_filename": file.filename,
        "detected_format": detected_format,
        "total_items": len(items),
        "status": "active",
    }

@app.get("/api/projects")
def list_projects():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.id,
            p.engineering_project_id,
            ep.project_name,
            ep.project_code,

            p.pcb_name,
            p.pcb_code,
            p.bom_filename,
            p.detected_format,
            p.created_at,
            p.status,
            p.current_item,

            COUNT(i.id) AS total_items,
            SUM(
                CASE
                    WHEN i.status != 'pending'
                    THEN 1
                    ELSE 0
                END
            ) AS marked_items

        FROM projects p

        LEFT JOIN engineering_projects ep
            ON ep.id = p.engineering_project_id

        LEFT JOIN project_bom_items i
            ON i.project_id = p.id

        GROUP BY p.id

        ORDER BY
            ep.project_name,
            p.created_at DESC
    """)

    projects = [dict(row) for row in cur.fetchall()]
    conn.close()

    return projects


@app.get("/api/projects/{project_id}")
def get_project(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.*,
            ep.project_name,
            ep.project_code
        FROM projects p
        LEFT JOIN engineering_projects ep
            ON ep.id = p.engineering_project_id
        WHERE p.id = ?
    """, (project_id,))

    project = cur.fetchone()

    if not project:
        conn.close()
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    cur.execute("""
        SELECT *
        FROM project_bom_items
        WHERE project_id = ?
        ORDER BY item ASC
    """, (project_id,))

    items = [dict(row) for row in cur.fetchall()]
    conn.close()

    return {
        "project": dict(project),
        "items": items,
    }


@app.patch("/api/projects/{project_id}/items/{item_id}")
def update_project_item(
    project_id: int,
    item_id: int,
    status: str = Form(...),
    comment: str = Form(""),
):
    allowed_status = [
        "pending",
        "no_stock",
        "wrong_footprint",
        "not_placed",
        "placed",
    ]

    if status not in allowed_status:
        raise HTTPException(status_code=400, detail="Estado no válido")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE project_bom_items
        SET status = ?, comment = ?
        WHERE project_id = ? AND id = ?
    """, (status, comment, project_id, item_id))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Item no encontrado")

    conn.commit()
    conn.close()

    return {
        "project_id": project_id,
        "item_id": item_id,
        "status": status,
        "comment": comment,
    }


@app.patch("/api/projects/{project_id}/items/{item_id}/comment")
def update_project_comment(
    project_id: int,
    item_id: int,
    comment: str = Form(""),
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE project_bom_items
        SET comment = ?
        WHERE project_id = ? AND id = ?
    """, (comment, project_id, item_id))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Item no encontrado")

    conn.commit()
    conn.close()

    return {
        "project_id": project_id,
        "item_id": item_id,
        "comment": comment,
    }


@app.patch("/api/projects/{project_id}/position")
def update_project_position(
    project_id: int,
    current_item: int = Form(...),
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE projects
        SET current_item = ?
        WHERE id = ?
    """, (current_item, project_id))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    conn.commit()
    conn.close()

    return {
        "project_id": project_id,
        "current_item": current_item,
    }


@app.post("/api/projects/{project_id}/finish")
def finish_project(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    # Se consideran montables todas las referencias excepto DNI.
    # Esto permite finalizar también BOMs que todavía tengan Side = UNKNOWN
    # cuando se está trabajando desde la vista ALL.
    cur.execute("""
        SELECT COUNT(*) AS total
        FROM project_bom_references
        WHERE project_id = ?
          AND side != 'DNI'
    """, (project_id,))

    total = cur.fetchone()["total"]

    cur.execute("""
        SELECT COUNT(*) AS pending
        FROM project_bom_references
        WHERE project_id = ?
          AND status = 'pending'
          AND side != 'DNI'
    """, (project_id,))

    pending = cur.fetchone()["pending"]

    if total == 0:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="El proyecto no tiene referencias montables"
        )

    if pending > 0:
        conn.close()
        raise HTTPException(
            status_code=400,
            detail=f"No se puede finalizar. Hay {pending} referencias pendientes",
        )

    cur.execute("""
        UPDATE projects
        SET status = 'finished'
        WHERE id = ?
    """, (project_id,))

    conn.commit()
    conn.close()

    return {
        "project_id": project_id,
        "status": "finished",
        "message": "Montaje finalizado correctamente",
    }


@app.get("/api/projects/{project_id}/export-xls")
def export_project_xls(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.*,
            ep.project_name,
            ep.project_code
        FROM projects p
        LEFT JOIN engineering_projects ep
            ON ep.id = p.engineering_project_id
        WHERE p.id = ?
    """, (project_id,))

    project = cur.fetchone()

    if not project:
        conn.close()
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    cur.execute("""
        SELECT *
        FROM project_bom_items
        WHERE project_id = ?
        ORDER BY item ASC
    """, (project_id,))

    items = [dict(row) for row in cur.fetchall()]
    conn.close()

    wb = xlwt.Workbook()
    ws = wb.add_sheet("BOM_Montaje")

    headers = [
        "Item", "Reference", "Quantity", "Value", "Description",
        "Manufacturer", "Manufacturer Part Number", "Footprint",
        "Supplier", "Supplier Part Number", "MPS PN", "RS",
        "FARNELL", "MOUSER", "DIGIKEY", "Buy", "NoMounted",
        "Package", "Stock", "WFootprint", "Placed", "Comment",
    ]

    for col, header in enumerate(headers):
        ws.write(0, col, header)

    for row_idx, item in enumerate(items, start=1):
        status = item.get("status", "pending")

        stock = "YES"
        wfootprint = "OK"
        placed = "NotPlaced"

        if status == "no_stock":
            stock = "NO"

        if status == "wrong_footprint":
            wfootprint = "NOK"

        if status == "placed":
            placed = "Placed"

        row = [
            item.get("item"),
            item.get("reference_designators"),
            item.get("quantity"),
            item.get("value"),
            item.get("description"),
            item.get("manufacturer"),
            item.get("manufacturer_part_number"),
            item.get("footprint"),
            item.get("supplier"),
            item.get("supplier_part_number"),
            item.get("mps_pn"),
            item.get("rs"),
            item.get("farnell"),
            item.get("mouser"),
            item.get("digikey"),
            item.get("buy"),
            item.get("no_mounted"),
            item.get("package"),
            stock,
            wfootprint,
            placed,
            item.get("comment"),
        ]

        for col_idx, value in enumerate(row):
            ws.write(row_idx, col_idx, "" if value is None else str(value))

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"BOM_Montaje_{project['pcb_code']}.xls"

    return StreamingResponse(
        output,
        media_type="application/vnd.ms-excel",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM projects WHERE id = ?", (project_id,))
    project = cur.fetchone()

    if not project:
        conn.close()
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    cur.execute("DELETE FROM project_bom_references WHERE project_id = ?", (project_id,))
    cur.execute("DELETE FROM project_bom_items WHERE project_id = ?", (project_id,))
    cur.execute("DELETE FROM projects WHERE id = ?", (project_id,))

    conn.commit()
    conn.close()

    return {
        "deleted": True,
        "project_id": project_id,
    }


@app.post("/api/reworks")
async def create_rework(
    engineering_project_id: int = Form(...),
    board_name: str = Form(...),
    board_code: str = Form(""),
    title: str = Form(...),
    description: str = Form(""),
    components: str = Form(""),
    image: UploadFile | None = File(None),
):
    conn = get_connection()
    cur = conn.cursor()

    image_path = ""

    if image:
        suffix = Path(image.filename or ".jpg").suffix

        filename = (
            f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
            f"{suffix}"
        )

        dst = UPLOAD_REWORKS / filename

        with open(dst, "wb") as f:
            shutil.copyfileobj(image.file, f)

        image_path = f"/uploads/reworks/{filename}"

    cur.execute("""
        INSERT INTO reworks (
            engineering_project_id,
            board_name,
            board_code,
            title,
            description,
            components,
            image_path,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        engineering_project_id,
        board_name,
        board_code,
        title,
        description,
        components,
        image_path,
        "open",
    ))

    rework_id = cur.lastrowid

    conn.commit()
    conn.close()

    return {
        "id": rework_id,
        "status": "open",
    }


@app.get("/api/reworks")
def list_reworks():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            r.*,
            ep.project_name,
            ep.project_code
        FROM reworks r
        LEFT JOIN engineering_projects ep
            ON ep.id = r.engineering_project_id
        ORDER BY
            ep.project_name,
            r.created_at DESC
    """)

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return rows


@app.get("/api/reworks/{rework_id}")
def get_rework(rework_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            r.*,
            ep.project_name,
            ep.project_code
        FROM reworks r
        LEFT JOIN engineering_projects ep
            ON ep.id = r.engineering_project_id
        WHERE r.id = ?
    """, (rework_id,))

    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Rework no encontrado")

    return dict(row)


@app.patch("/api/reworks/{rework_id}/status")
def update_rework_status(
    rework_id: int,
    status: str = Form(...),
):
    allowed = [
        "open",
        "in_progress",
        "waiting_parts",
        "done",
        "cancelled",
    ]

    if status not in allowed:
        raise HTTPException(status_code=400, detail="Estado no válido")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE reworks
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (status, rework_id))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Rework no encontrado")

    conn.commit()
    conn.close()

    return {
        "id": rework_id,
        "status": status,
    }


@app.get("/api/reworks/{rework_id}/comments")
def list_rework_comments(rework_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT *
        FROM rework_comments
        WHERE rework_id = ?
        ORDER BY created_at ASC
    """, (rework_id,))

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return rows


@app.post("/api/reworks/{rework_id}/comments")
def create_rework_comment(
    rework_id: int,
    comment: str = Form(...),
    created_by: str = Form(""),
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM reworks WHERE id = ?", (rework_id,))
    rework = cur.fetchone()

    if not rework:
        conn.close()
        raise HTTPException(status_code=404, detail="Rework no encontrado")

    cur.execute("""
        INSERT INTO rework_comments (
            rework_id,
            comment,
            created_by
        )
        VALUES (?, ?, ?)
    """, (
        rework_id,
        comment,
        created_by,
    ))

    comment_id = cur.lastrowid

    cur.execute("""
        UPDATE reworks
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (rework_id,))

    conn.commit()
    conn.close()

    return {
        "id": comment_id,
        "rework_id": rework_id,
        "comment": comment,
        "created_by": created_by,
    }


@app.delete("/api/reworks/{rework_id}")
def delete_rework(rework_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM reworks WHERE id = ?", (rework_id,))
    rework = cur.fetchone()

    if not rework:
        conn.close()
        raise HTTPException(status_code=404, detail="Rework no encontrado")

    cur.execute("DELETE FROM rework_comments WHERE rework_id = ?", (rework_id,))
    cur.execute("DELETE FROM reworks WHERE id = ?", (rework_id,))

    conn.commit()
    conn.close()

    return {
        "deleted": True,
        "rework_id": rework_id,
    }

@app.get("/api/engineering-projects/{project_id}/dashboard")
def get_engineering_project_dashboard(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT *
        FROM engineering_projects
        WHERE id = ?
    """, (project_id,))
    project = cur.fetchone()

    if not project:
        conn.close()
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")

    cur.execute("""
        SELECT
            p.*,
            COUNT(i.id) AS total_items,
            SUM(CASE WHEN i.status != 'pending' THEN 1 ELSE 0 END) AS marked_items
        FROM projects p
        LEFT JOIN project_bom_items i ON i.project_id = p.id
        WHERE p.engineering_project_id = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC
    """, (project_id,))
    boms = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT *
        FROM reworks
        WHERE engineering_project_id = ?
        ORDER BY created_at DESC
    """, (project_id,))
    reworks = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT *
        FROM pcbs
        WHERE engineering_project_id = ?
        ORDER BY created_at DESC
    """, (project_id,))
    pcbs = [dict(r) for r in cur.fetchall()]

    pcb_progress_values = []

    for pcb in pcbs:
        cur.execute("""
            SELECT *
            FROM pcb_checklist_items
            WHERE pcb_id = ?
            ORDER BY position ASC
        """, (pcb["id"],))

        checklist = [dict(r) for r in cur.fetchall()]

        total = len(checklist)
        completed = len([x for x in checklist if x["status"] == "completed"])
        in_progress = len([x for x in checklist if x["status"] == "in_progress"])
        blocked = len([x for x in checklist if x["status"] == "blocked"])

        score = 0

        for item in checklist:
            if item["status"] == "completed":
                score += 1
            elif item["status"] == "in_progress":
                score += 0.5

        progress = round((score * 100) / total) if total > 0 else 0

        current_phase = "Not Initialized" if total == 0 else "Completed"

        if total > 0:
            for item in checklist:
                if item["status"] == "in_progress":
                    current_phase = item["phase"]
                    break

            if current_phase == "Completed":
                for item in checklist:
                    if item["status"] != "completed":
                        current_phase = item["phase"]
                        break

        pcb["progress"] = progress
        pcb["current_phase"] = current_phase
        pcb["is_blocked"] = blocked > 0
        pcb["total_tasks"] = total
        pcb["completed_tasks"] = completed
        pcb["in_progress_tasks"] = in_progress
        pcb["blocked_tasks"] = blocked
        pcb["pending_tasks"] = total - completed - in_progress - blocked

        pcb_progress_values.append(progress)

    bom_count = len(boms)
    rework_count = len(reworks)

    open_reworks = len([
        r for r in reworks
        if r.get("status") not in ["done", "cancelled"]
    ])

    closed_reworks = len([
        r for r in reworks
        if r.get("status") in ["done", "cancelled"]
    ])

    pcb_count = len(pcbs)

    overall_pcb_progress = (
        round(sum(pcb_progress_values) / len(pcb_progress_values))
        if pcb_progress_values
        else 0
    )

    blocked_pcbs = len([
        p for p in pcbs
        if p.get("is_blocked")
    ])

    most_advanced_pcb = None
    least_advanced_pcb = None

    if pcbs:
        most_advanced_pcb = max(
            pcbs,
            key=lambda x: x.get("progress", 0)
        )

        least_advanced_pcb = min(
            pcbs,
            key=lambda x: x.get("progress", 0)
        )

    conn.close()

    return {
        "project": dict(project),

        "stats": {
            "bom_count": bom_count,
            "rework_count": rework_count,
            "open_reworks": open_reworks,
            "closed_reworks": closed_reworks,
            "pcb_count": pcb_count,
            "overall_pcb_progress": overall_pcb_progress,
            "blocked_pcbs": blocked_pcbs,
            "most_advanced_pcb": most_advanced_pcb,
            "least_advanced_pcb": least_advanced_pcb,
        },

        "boms": boms,
        "reworks": reworks[:5],
        "pcbs": pcbs,
    }
# ============================================================
# PCBS
# ============================================================

@app.post("/api/pcbs")
def create_pcb(
    engineering_project_id: int = Form(...),
    pcb_name: str = Form(...),
    pcb_revision: str = Form(""),
    description: str = Form("")
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO pcbs (
            engineering_project_id,
            pcb_name,
            pcb_revision,
            description,
            status
        )
        VALUES (?, ?, ?, ?, ?)
    """, (
        engineering_project_id,
        pcb_name,
        pcb_revision,
        description,
        "development"
    ))

    pcb_id = cur.lastrowid

    for position, (phase, task_name) in enumerate(PCB_DEFAULT_CHECKLIST, start=1):
        cur.execute("""
            INSERT INTO pcb_checklist_items (
                pcb_id,
                phase,
                task_name,
                position,
                status
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            pcb_id,
            phase,
            task_name,
            position,
            "not_started"
        ))

    conn.commit()
    conn.close()

    return {
        "id": pcb_id
    }

@app.get("/api/pcbs")
def list_pcbs():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.*,
            ep.project_name,
            ep.project_code
        FROM pcbs p
        LEFT JOIN engineering_projects ep
            ON ep.id = p.engineering_project_id
        ORDER BY
            ep.project_name,
            p.created_at DESC
    """)

    pcbs = [dict(r) for r in cur.fetchall()]

    for pcb in pcbs:
        cur.execute("""
            SELECT *
            FROM pcb_checklist_items
            WHERE pcb_id = ?
            ORDER BY position ASC
        """, (pcb["id"],))

        checklist = [dict(r) for r in cur.fetchall()]

        total = len(checklist)
        completed = len([x for x in checklist if x["status"] == "completed"])
        in_progress = len([x for x in checklist if x["status"] == "in_progress"])
        blocked = len([x for x in checklist if x["status"] == "blocked"])
        pending = total - completed - in_progress - blocked

        score = 0

        for item in checklist:
            if item["status"] == "completed":
                score += 1
            elif item["status"] == "in_progress":
                score += 0.5

        progress = round((score * 100) / total) if total > 0 else 0

        if total == 0:
            current_phase = "Not Initialized"
        else:
            current_phase = "Completed"

        for item in checklist:
            if item["status"] == "in_progress":
                current_phase = item["phase"]
                break

        if current_phase == "Completed":
            for item in checklist:
                if item["status"] != "completed":
                    current_phase = item["phase"]
                    break

        pcb["total_tasks"] = total
        pcb["completed_tasks"] = completed
        pcb["in_progress_tasks"] = in_progress
        pcb["blocked_tasks"] = blocked
        pcb["pending_tasks"] = pending
        pcb["progress"] = progress
        pcb["current_phase"] = current_phase
        pcb["is_blocked"] = blocked > 0

    conn.close()

    return pcbs

@app.get("/api/pcbs/{pcb_id}")
def get_pcb(pcb_id: int):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.*,
            ep.project_name,
            ep.project_code
        FROM pcbs p
        LEFT JOIN engineering_projects ep
            ON ep.id = p.engineering_project_id
        WHERE p.id = ?
    """, (pcb_id,))

    row = cur.fetchone()

    conn.close()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="PCB no encontrada"
        )

    return dict(row)

@app.get("/api/pcbs/{pcb_id}")
def get_pcb(pcb_id: int):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.*,
            ep.project_name,
            ep.project_code
        FROM pcbs p
        LEFT JOIN engineering_projects ep
            ON ep.id = p.engineering_project_id
        WHERE p.id = ?
    """, (pcb_id,))

    row = cur.fetchone()

    conn.close()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="PCB no encontrada"
        )

    return dict(row)

@app.delete("/api/pcbs/{pcb_id}")
def delete_pcb(pcb_id: int):

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM pcbs
        WHERE id = ?
    """, (pcb_id,))

    conn.commit()
    conn.close()

    return {
        "deleted": True
    }

@app.get("/api/pcbs/{pcb_id}/detail")
def get_pcb_detail(pcb_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            p.*,
            ep.project_name,
            ep.project_code
        FROM pcbs p
        LEFT JOIN engineering_projects ep
            ON ep.id = p.engineering_project_id
        WHERE p.id = ?
    """, (pcb_id,))

    pcb = cur.fetchone()

    if not pcb:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="PCB no encontrada"
        )

    cur.execute("""
        SELECT *
        FROM pcb_checklist_items
        WHERE pcb_id = ?
        ORDER BY position ASC
    """, (pcb_id,))

    checklist = [dict(r) for r in cur.fetchall()]

    total = len(checklist)
    completed = len([x for x in checklist if x["status"] == "completed"])
    in_progress = len([x for x in checklist if x["status"] == "in_progress"])
    blocked = len([x for x in checklist if x["status"] == "blocked"])
    not_started = len([x for x in checklist if x["status"] == "not_started"])

    progress = round((completed * 100) / total) if total > 0 else 0

    phases = {}

    for item in checklist:
        phase = item["phase"]

        if phase not in phases:
            phases[phase] = []

        phases[phase].append(item)

    conn.close()

    return {
        "pcb": dict(pcb),
        "stats": {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "blocked": blocked,
            "not_started": not_started,
            "progress": progress
        },
        "phases": phases,
        "checklist": checklist
    }

@app.patch("/api/pcbs/{pcb_id}/checklist/{item_id}")
def update_pcb_checklist_item(
    pcb_id: int,
    item_id: int,
    status: str = Form(...)
):
    allowed = [
        "not_started",
        "in_progress",
        "completed",
        "blocked"
    ]

    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Estado no válido"
        )

    completed_at_sql = "CURRENT_TIMESTAMP" if status == "completed" else "NULL"

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(f"""
        UPDATE pcb_checklist_items
        SET
            status = ?,
            completed_at = {completed_at_sql}
        WHERE pcb_id = ?
          AND id = ?
    """, (
        status,
        pcb_id,
        item_id
    ))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Checklist item no encontrado"
        )

    conn.commit()
    conn.close()

    return {
        "pcb_id": pcb_id,
        "item_id": item_id,
        "status": status
    }

@app.patch("/api/projects/{project_id}/items/{item_id}/side")
def update_project_item_side(
    project_id: int,
    item_id: int,
    side: str = Form(...)
):
    allowed = [
        "TOP",
        "BOTTOM",
        "THROUGH_HOLE",
        "DNI",
        "UNKNOWN"
    ]

    if side not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Side no válido"
        )

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE project_bom_items
        SET side = ?
        WHERE project_id = ? AND id = ?
    """, (
        side,
        project_id,
        item_id
    ))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Item no encontrado"
        )

    conn.commit()
    conn.close()

    return {
        "project_id": project_id,
        "item_id": item_id,
        "side": side
    }

@app.get("/api/projects/{project_id}/assembly-references")
def get_project_assembly_references(project_id: int, side: str = "ALL"):
    conn = get_connection()
    cur = conn.cursor()

    query = """
        SELECT
            r.id,
            r.project_id,
            r.bom_item_id,
            r.reference_designator,
            r.side,
            r.status,
            r.comment,

            i.value,
            i.description,
            i.manufacturer,
            i.manufacturer_part_number,
            i.footprint,
            i.package,
            i.supplier,
            i.supplier_part_number,
            i.mps_pn,
            i.digikey,
            i.mouser,
            i.farnell

        FROM project_bom_references r
        LEFT JOIN project_bom_items i
            ON i.id = r.bom_item_id
        WHERE r.project_id = ?
    """

    params = [project_id]

    if side != "ALL":
        query += " AND r.side = ?"
        params.append(side)
    else:
        query += " AND r.side != 'DNI'"

    query += " ORDER BY r.reference_designator ASC"

    cur.execute(query, params)

    rows = [dict(r) for r in cur.fetchall()]

    conn.close()

    return rows

@app.patch("/api/projects/{project_id}/references/{reference_id}/status")
def update_project_reference_status(
    project_id: int,
    reference_id: int,
    status: str = Form(...),
    comment: str = Form("")
):
    allowed = [
        "pending",
        "placed",
        "no_stock",
        "wrong_footprint",
        "not_placed"
    ]

    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Estado no válido"
        )

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT bom_item_id
        FROM project_bom_references
        WHERE project_id = ?
          AND id = ?
    """, (
        project_id,
        reference_id
    ))

    ref = cur.fetchone()

    if not ref:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Referencia no encontrada"
        )

    bom_item_id = ref["bom_item_id"]

    cur.execute("""
        UPDATE project_bom_references
        SET status = ?, comment = ?
        WHERE project_id = ?
          AND id = ?
    """, (
        status,
        comment,
        project_id,
        reference_id
    ))

    # Sincroniza el estado agregado del item original del BOM.
    # Esto evita que project_bom_items quede en "pending" aunque
    # todas sus referencias individuales ya estén marcadas.
    cur.execute("""
        SELECT status, COUNT(*) AS total
        FROM project_bom_references
        WHERE project_id = ?
          AND bom_item_id = ?
          AND side != 'DNI'
        GROUP BY status
    """, (
        project_id,
        bom_item_id
    ))

    status_counts = {
        row["status"]: row["total"]
        for row in cur.fetchall()
    }

    total_refs = sum(status_counts.values())
    pending_refs = status_counts.get("pending", 0)

    if total_refs == 0:
        item_status = "pending"
    elif pending_refs > 0:
        item_status = "pending"
    elif status_counts.get("no_stock", 0) > 0:
        item_status = "no_stock"
    elif status_counts.get("wrong_footprint", 0) > 0:
        item_status = "wrong_footprint"
    elif status_counts.get("not_placed", 0) > 0:
        item_status = "not_placed"
    else:
        item_status = "placed"

    cur.execute("""
        UPDATE project_bom_items
        SET status = ?
        WHERE project_id = ?
          AND id = ?
    """, (
        item_status,
        project_id,
        bom_item_id
    ))

    conn.commit()
    conn.close()

    return {
        "project_id": project_id,
        "reference_id": reference_id,
        "bom_item_id": bom_item_id,
        "status": status,
        "item_status": item_status,
        "comment": comment
    }


@app.get("/api/projects/{project_id}/references")
def get_project_references(project_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            r.id,
            r.project_id,
            r.bom_item_id,
            r.reference_designator,
            r.side,
            r.status,
            r.comment,

            i.item,
            i.quantity,
            i.value,
            i.description,
            i.manufacturer,
            i.manufacturer_part_number,
            i.footprint,
            i.package,
            i.supplier,
            i.supplier_part_number,
            i.mps_pn,
            i.rs,
            i.farnell,
            i.mouser,
            i.digikey,
            i.buy,
            i.no_mounted

        FROM project_bom_references r
        LEFT JOIN project_bom_items i
            ON i.id = r.bom_item_id
        WHERE r.project_id = ?
        ORDER BY r.reference_designator ASC
    """, (project_id,))

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return rows

@app.patch("/api/projects/{project_id}/references/{reference_id}/side")
def update_project_reference_side(
    project_id: int,
    reference_id: int,
    side: str = Form(...)
):
    allowed = [
        "TOP",
        "BOTTOM",
        "THROUGH_HOLE",
        "DNI",
        "UNKNOWN"
    ]

    if side not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Side no válido"
        )

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE project_bom_references
        SET side = ?
        WHERE project_id = ?
          AND id = ?
    """, (
        side,
        project_id,
        reference_id
    ))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Referencia no encontrada"
        )

    conn.commit()
    conn.close()

    return {
        "project_id": project_id,
        "reference_id": reference_id,
        "side": side
    }

@app.get("/api/pcbs/{pcb_id}/test-points")
def get_pcb_test_points(pcb_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT *
        FROM pcb_test_points
        WHERE pcb_id = ?
        ORDER BY designator ASC
    """, (pcb_id,))

    rows = [dict(r) for r in cur.fetchall()]

    conn.close()

    return rows

@app.post("/api/pcbs/{pcb_id}/test-points")
def create_pcb_test_point(
    pcb_id: int,
    designator: str = Form(...),
    signal: str = Form(...),
    description: str = Form(""),
    expected_value: str = Form("")
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO pcb_test_points (
            pcb_id,
            designator,
            signal,
            description,
            expected_value,
            measured_value,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        pcb_id,
        designator,
        signal,
        description,
        expected_value,
        "",
        "NOT_TESTED"
    ))

    conn.commit()
    conn.close()

    return {
        "pcb_id": pcb_id,
        "designator": designator,
        "signal": signal,
        "description": description,
        "expected_value": expected_value,
        "measured_value": "",
        "status": "NOT_TESTED"
    }

@app.patch("/api/pcbs/{pcb_id}/test-points/{test_point_id}")
def update_pcb_test_point(
    pcb_id: int,
    test_point_id: int,
    status: str = Form(...),
    measured_value: str = Form(""),
    expected_value: str = Form(""),
    description: str = Form("")
):
    allowed = [
        "NOT_TESTED",
        "PASS",
        "FAIL",
        "NA"
    ]

    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Estado no válido"
        )

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE pcb_test_points
        SET
            status = ?,
            measured_value = ?,
            expected_value = ?,
            description = ?
        WHERE pcb_id = ?
          AND id = ?
    """, (
        status,
        measured_value,
        expected_value,
        description,
        pcb_id,
        test_point_id
    ))

    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(
            status_code=404,
            detail="Test point no encontrado"
        )

    conn.commit()
    conn.close()

    return {
        "id": test_point_id,
        "pcb_id": pcb_id,
        "status": status,
        "measured_value": measured_value,
        "expected_value": expected_value,
        "description": description
    }

    conn.commit()
    conn.close()

    return {
        "pcb_id": pcb_id,
        "designator": designator,
        "signal": signal,
        "description": description
    }

@app.delete("/api/pcbs/{pcb_id}/test-points/{test_point_id}")
def delete_pcb_test_point(
    pcb_id: int,
    test_point_id: int
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        DELETE FROM pcb_test_points
        WHERE pcb_id = ?
          AND id = ?
    """, (
        pcb_id,
        test_point_id
    ))

    conn.commit()
    conn.close()

    return {
        "deleted": True,
        "pcb_id": pcb_id,
        "test_point_id": test_point_id
    }

@app.get("/api/pcbs/{pcb_id}/test-points/export-xlsx")
def export_pcb_test_points_xlsx(pcb_id: int):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            designator,
            signal,
            expected_value,
            measured_value,
            status,
            description,
            created_at
        FROM pcb_test_points
        WHERE pcb_id = ?
        ORDER BY designator ASC
    """, (pcb_id,))

    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    export_dir = "exports"
    os.makedirs(export_dir, exist_ok=True)

    file_path = os.path.join(
        export_dir,
        f"pcb_{pcb_id}_test_points.xlsx"
    )

    df = pd.DataFrame(rows)

    if df.empty:
        df = pd.DataFrame(columns=[
            "designator",
            "signal",
            "expected_value",
            "measured_value",
            "status",
            "description",
            "created_at"
        ])

    df.to_excel(file_path, index=False)

    return FileResponse(
        file_path,
        filename=f"pcb_{pcb_id}_test_points.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


# ============================================================
# AUTH ENDPOINTS
# ============================================================

@app.post("/api/auth/create-admin")
def create_admin(
    username: str = Form(...),
    password: str = Form(...)
):
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO users (
                username,
                password_hash,
                role,
                is_active
            )
            VALUES (?, ?, ?, ?)
        """, (
            username,
            hash_password(password),
            "admin",
            1
        ))

        conn.commit()

    except Exception as exc:
        conn.rollback()
        conn.close()

        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(
                status_code=400,
                detail="Ya existe un usuario con ese username"
            )

        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )

    conn.close()

    return {
        "created": True,
        "username": username,
        "role": "admin"
    }


@app.post("/api/auth/login")
def login(
    username: str = Form(...),
    password: str = Form(...)
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT *
        FROM users
        WHERE username = ?
          AND is_active = 1
    """, (username,))

    user = cur.fetchone()
    conn.close()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Usuario incorrecto"
        )

    user = dict(user)

    if not verify_password(
        password,
        user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Contraseña incorrecta"
        )

    token = create_token(user)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    }



