from pydantic import BaseModel
from typing import List, Optional

class BomItem(BaseModel):
    item: int
    references: str
    quantity: int
    value: str = "-"
    description: str = "-"
    manufacturer: str = "-"
    manufacturer_part_number: str = "-"
    footprint: str = "-"
    package: str = "-"
    supplier: str = "-"
    supplier_part_number: str = "-"
    mps_pn: str = "-"
    rs: str = "-"
    farnell: str = "-"
    mouser: str = "-"
    digikey: str = "-"
    buy: str = "-"
    no_mounted: str = "-"
    status: str = "pending"
    comment: str = ""

class BomUploadResponse(BaseModel):
    detected_format: str
    total_items: int
    items: List[BomItem]
