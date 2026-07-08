import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "app.db"


def get_connection():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def add_column_if_not_exists(cur, table_name, column_name, column_definition):
    cur.execute(f"PRAGMA table_info({table_name})")
    columns = [row["name"] for row in cur.fetchall()]

    if column_name not in columns:
        cur.execute(f"""
            ALTER TABLE {table_name}
            ADD COLUMN {column_name} {column_definition}
        """)


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pcb_name TEXT NOT NULL,
        pcb_code TEXT NOT NULL UNIQUE,
        bom_filename TEXT,
        detected_format TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active',
        current_item INTEGER DEFAULT 0
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS project_bom_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        item INTEGER,
        reference_designators TEXT,
        quantity INTEGER,
        value TEXT,
        description TEXT,
        manufacturer TEXT,
        manufacturer_part_number TEXT,
        footprint TEXT,
        package TEXT,
        supplier TEXT,
        supplier_part_number TEXT,
        mps_pn TEXT,
        rs TEXT,
        farnell TEXT,
        mouser TEXT,
        digikey TEXT,
        buy TEXT,
        no_mounted TEXT,
        status TEXT DEFAULT 'pending',
        comment TEXT DEFAULT '',
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )
    """)

    try:
        cur.execute("""
            ALTER TABLE project_bom_items
            ADD COLUMN side TEXT DEFAULT 'UNKNOWN'
        """)
    except:
        pass
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reworks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_name TEXT NOT NULL,
            board_code TEXT,
            title TEXT NOT NULL,
            description TEXT,
            components TEXT,
            image_path TEXT,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    add_column_if_not_exists(
        cur,
        "projects",
        "current_item",
        "INTEGER DEFAULT 0"
    )

    cur.execute("""
        CREATE TABLE IF NOT EXISTS rework_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rework_id INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_by TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(rework_id) REFERENCES reworks(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS engineering_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        project_code TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pcbs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            engineering_project_id INTEGER NOT NULL,

            pcb_name TEXT NOT NULL,
            pcb_revision TEXT DEFAULT '',

            description TEXT DEFAULT '',

            status TEXT DEFAULT 'development',

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY(engineering_project_id)
                REFERENCES engineering_projects(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pcb_checklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pcb_id INTEGER NOT NULL,
            phase TEXT NOT NULL,
            task_name TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            status TEXT DEFAULT 'not_started',
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(pcb_id) REFERENCES pcbs(id)
        )
    """)
    
    try:
        cur.execute("""
            ALTER TABLE projects
            ADD COLUMN engineering_project_id INTEGER
        """)
    except:
        pass

    try:
        cur.execute("""
            ALTER TABLE reworks
            ADD COLUMN engineering_project_id INTEGER
        """)
    except:
        pass
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS project_bom_references (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            bom_item_id INTEGER NOT NULL,
            reference_designator TEXT NOT NULL,
            side TEXT DEFAULT 'UNKNOWN',
            status TEXT DEFAULT 'pending',
            comment TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(bom_item_id) REFERENCES project_bom_items(id)
    )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS pcb_test_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pcb_id INTEGER NOT NULL,
            designator TEXT NOT NULL,
            signal TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(pcb_id) REFERENCES pcbs(id)
    )
    """)

    try:
        cur.execute("""
            ALTER TABLE pcb_test_points
            ADD COLUMN status TEXT DEFAULT 'NOT_TESTED'
        """)
    except:
        pass

    try:
        cur.execute("""
            ALTER TABLE pcb_test_points
            ADD COLUMN expected_value TEXT DEFAULT ''
        """)
    except:
        pass

    try:
        cur.execute("""
            ALTER TABLE pcb_test_points
            ADD COLUMN measured_value TEXT DEFAULT ''
        """)
    except:
        pass

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'viewer',
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()