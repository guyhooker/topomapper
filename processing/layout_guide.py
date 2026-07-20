"""Printable sheet-layout and part-orientation guide generation."""

from __future__ import annotations

import io
import math
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = landscape(A4)
FOREST = colors.HexColor("#214f3d")
MUTED = colors.HexColor("#61736a")
LINE = colors.HexColor("#b7c1b8")
PAPER = colors.HexColor("#faf8f2")
PART_FILL = colors.HexColor("#e1ebe4")
ACCENT = colors.HexColor("#1d6f82")


class LayoutGuideError(ValueError):
    """Raised when a layout-guide request is incomplete or malformed."""


def _number(value: Any, name: str, minimum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise LayoutGuideError(f"{name} must be a number.") from error
    if not math.isfinite(result):
        raise LayoutGuideError(f"{name} must be finite.")
    if minimum is not None and result < minimum:
        raise LayoutGuideError(f"{name} must be at least {minimum:g}.")
    return result


def _clean_payload(payload: dict[str, Any]) -> dict[str, Any]:
    width = _number(payload.get("sheet_width_mm"), "Sheet width", 1)
    height = _number(payload.get("sheet_height_mm"), "Sheet height", 1)
    edge = _number(payload.get("edge_margin_mm", 0), "Edge margin", 0)
    sheets = payload.get("sheets")
    if not isinstance(sheets, list) or not sheets:
        raise LayoutGuideError("Place at least one part before creating the guide.")
    clean_sheets: list[dict[str, Any]] = []
    for sheet in sheets:
        if not isinstance(sheet, dict) or not isinstance(sheet.get("parts"), list):
            raise LayoutGuideError("A sheet in the guide is malformed.")
        clean_parts: list[dict[str, Any]] = []
        for part in sheet["parts"]:
            if not isinstance(part, dict) or not isinstance(part.get("rings"), list) or not part["rings"]:
                continue
            rings: list[list[tuple[float, float]]] = []
            for ring in part["rings"]:
                if not isinstance(ring, list) or len(ring) < 3:
                    continue
                rings.append([(_number(point[0], "Part X"), _number(point[1], "Part Y")) for point in ring if isinstance(point, list) and len(point) >= 2])
            if not rings or len(rings[0]) < 3:
                continue
            label = part.get("label_point", {})
            north = part.get("north_point", {})
            clean_parts.append({
                "id": str(part.get("id", "?"))[:40],
                "rotation": _number(part.get("rotation", 0), "Rotation"),
                "rings": rings,
                "label": (_number(label.get("x", 0), "Label X"), _number(label.get("y", 0), "Label Y")),
                "north": (_number(north.get("x", 0), "North X"), _number(north.get("y", 0), "North Y")),
            })
        if clean_parts:
            clean_sheets.append({"index": int(sheet.get("index", len(clean_sheets))) + 1, "parts": clean_parts})
    if not clean_sheets:
        raise LayoutGuideError("No readable placed parts were supplied.")
    return {
        "project": str(payload.get("project_name", "Topomapper project"))[:120],
        "width": width,
        "height": height,
        "edge": edge,
        "sheets": clean_sheets,
    }


def _sheet_transform(width: float, height: float) -> tuple[float, float, float]:
    left, bottom = 36.0, 66.0
    available_width, available_height = PAGE_WIDTH - 72.0, PAGE_HEIGHT - 116.0
    scale = min(available_width / width, available_height / height)
    return left + (available_width - width * scale) / 2, bottom + (available_height - height * scale) / 2, scale


def _point(x: float, y: float, origin_x: float, origin_y: float, scale: float, sheet_height: float) -> tuple[float, float]:
    return origin_x + x * scale, origin_y + (sheet_height - y) * scale


def _draw_header(pdf: canvas.Canvas, project: str, subtitle: str) -> None:
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    pdf.setFillColor(FOREST)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(36, PAGE_HEIGHT - 32, project)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8)
    pdf.drawRightString(PAGE_WIDTH - 36, PAGE_HEIGHT - 29, subtitle)
    pdf.setStrokeColor(LINE)
    pdf.line(36, PAGE_HEIGHT - 40, PAGE_WIDTH - 36, PAGE_HEIGHT - 40)


def _draw_footer(pdf: canvas.Canvas, page_number: int) -> None:
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(36, 25, "North arrows show assembly north; stock-sheet rotation is arbitrary.")
    pdf.drawRightString(PAGE_WIDTH - 36, 25, f"Topomapper layout guide · page {page_number}")


def _overlaps(left: tuple[float, float, float, float], right: tuple[float, float, float, float]) -> bool:
    return left[2] > right[0] and left[0] < right[2] and left[3] > right[1] and left[1] < right[3]


def _label_box(anchor_x: float, anchor_y: float, text: str, occupied: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    width = max(25.0, stringWidth(text, "Helvetica-Bold", 6.6) + 17.0)
    height = 12.0
    offsets = [(7, 7), (7, -19), (-width - 7, 7), (-width - 7, -19), (15, -6), (-width - 15, -6), (0, 18), (0, -30)]
    candidates = [(anchor_x + dx, anchor_y + dy, anchor_x + dx + width, anchor_y + dy + height) for dx, dy in offsets]
    for candidate in candidates:
        if candidate[0] >= 38 and candidate[2] <= PAGE_WIDTH - 38 and candidate[1] >= 52 and candidate[3] <= PAGE_HEIGHT - 48 and not any(_overlaps(candidate, other) for other in occupied):
            occupied.append(candidate)
            return candidate
    candidate = candidates[0]
    occupied.append(candidate)
    return candidate


def _draw_overview(pdf: canvas.Canvas, data: dict[str, Any], sheet: dict[str, Any], page_number: int) -> None:
    width, height, edge = data["width"], data["height"], data["edge"]
    parts = sheet["parts"]
    _draw_header(pdf, data["project"], f"Sheet {sheet['index']} overview · {width:g} × {height:g} mm · {len(parts)} parts")
    origin_x, origin_y, scale = _sheet_transform(width, height)
    pdf.setFillColor(colors.white)
    pdf.setStrokeColor(FOREST)
    pdf.setLineWidth(1)
    pdf.rect(origin_x, origin_y, width * scale, height * scale, fill=1, stroke=1)
    if edge > 0:
        pdf.setStrokeColor(LINE)
        pdf.setDash(3, 2)
        pdf.rect(origin_x + edge * scale, origin_y + edge * scale, max(0, (width - edge * 2) * scale), max(0, (height - edge * 2) * scale), fill=0, stroke=1)
        pdf.setDash()

    for part in parts:
        for ring_index, ring in enumerate(part["rings"]):
            path = pdf.beginPath()
            start = _point(ring[0][0], ring[0][1], origin_x, origin_y, scale, height)
            path.moveTo(*start)
            for x, y in ring[1:]:
                path.lineTo(*_point(x, y, origin_x, origin_y, scale, height))
            path.close()
            pdf.setFillColor(PART_FILL if ring_index == 0 else colors.white)
            pdf.setStrokeColor(FOREST if ring_index == 0 else LINE)
            pdf.setLineWidth(.45)
            pdf.drawPath(path, fill=1, stroke=1)

    occupied: list[tuple[float, float, float, float]] = []
    for part in sorted(parts, key=lambda item: item["id"]):
        anchor_x, anchor_y = _point(part["label"][0], part["label"][1], origin_x, origin_y, scale, height)
        north_x, north_y = _point(part["north"][0], part["north"][1], origin_x, origin_y, scale, height)
        box = _label_box(anchor_x, anchor_y, part["id"], occupied)
        centre_y = (box[1] + box[3]) / 2
        join_x = box[0] if anchor_x < box[0] else box[2] if anchor_x > box[2] else (box[0] + box[2]) / 2
        pdf.setStrokeColor(LINE)
        pdf.setLineWidth(.35)
        pdf.line(anchor_x, anchor_y, join_x, centre_y)
        pdf.setFillColor(colors.white)
        pdf.setStrokeColor(ACCENT)
        pdf.roundRect(box[0], box[1], box[2] - box[0], box[3] - box[1], 2, fill=1, stroke=1)
        pdf.setFillColor(FOREST)
        pdf.setFont("Helvetica-Bold", 6.6)
        pdf.drawString(box[0] + 3.5, box[1] + 3.1, part["id"])
        dx, dy = north_x - anchor_x, north_y - anchor_y
        magnitude = max(.001, math.hypot(dx, dy))
        dx, dy = dx / magnitude * 6.5, dy / magnitude * 6.5
        arrow_x, arrow_y = box[2] - 7.0, centre_y
        pdf.setStrokeColor(ACCENT)
        pdf.setFillColor(ACCENT)
        pdf.setLineWidth(.8)
        pdf.line(arrow_x, arrow_y, arrow_x + dx, arrow_y + dy)
        angle = math.atan2(dy, dx)
        tip_x, tip_y = arrow_x + dx, arrow_y + dy
        wing = 2.2
        pdf.line(tip_x, tip_y, tip_x - wing * math.cos(angle - .55), tip_y - wing * math.sin(angle - .55))
        pdf.line(tip_x, tip_y, tip_x - wing * math.cos(angle + .55), tip_y - wing * math.sin(angle + .55))
    _draw_footer(pdf, page_number)


def _draw_index(pdf: canvas.Canvas, data: dict[str, Any], sheet: dict[str, Any], page_number: int, page_part: int, page_total: int, rows: list[dict[str, Any]]) -> None:
    _draw_header(pdf, data["project"], f"Sheet {sheet['index']} part index · {page_part}/{page_total}")
    x_positions = [40, 170, 300, 430, 560, 690]
    headings = ["Part ID", "Rotation on stock", "X (mm)", "Y (mm)", "Size (mm)", "Assembly"]
    pdf.setFillColor(FOREST)
    pdf.setFont("Helvetica-Bold", 8)
    for x, heading in zip(x_positions, headings):
        pdf.drawString(x, PAGE_HEIGHT - 64, heading)
    pdf.setStrokeColor(LINE)
    pdf.line(36, PAGE_HEIGHT - 70, PAGE_WIDTH - 36, PAGE_HEIGHT - 70)
    y = PAGE_HEIGHT - 88
    pdf.setFont("Helvetica", 8)
    for row_index, part in enumerate(rows):
        points = [point for ring in part["rings"] for point in ring]
        left, right = min(point[0] for point in points), max(point[0] for point in points)
        top, bottom = min(point[1] for point in points), max(point[1] for point in points)
        if row_index % 2 == 0:
            pdf.setFillColor(colors.HexColor("#f0f3ef"))
            pdf.rect(36, y - 6, PAGE_WIDTH - 72, 19, fill=1, stroke=0)
        values = [part["id"], f"{part['rotation'] % 360:g}°", f"{left:.1f}", f"{top:.1f}", f"{right-left:.1f} × {bottom-top:.1f}", "Follow N arrow"]
        pdf.setFillColor(FOREST if row_index % 2 == 0 else MUTED)
        for x, value in zip(x_positions, values):
            pdf.drawString(x, y, value)
        y -= 21
    _draw_footer(pdf, page_number)


def generate_layout_guide(payload: dict[str, Any]) -> bytes:
    """Return an A4 landscape PDF containing sheet maps and part indexes."""
    data = _clean_payload(payload)
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=(PAGE_WIDTH, PAGE_HEIGHT), pageCompression=1)
    pdf.setTitle(f"{data['project']} — layout guide")
    pdf.setAuthor("Topomapper")
    page_number = 1
    for sheet in data["sheets"]:
        _draw_overview(pdf, data, sheet, page_number)
        pdf.showPage()
        page_number += 1
        rows_per_page = 22
        chunks = [sheet["parts"][index:index + rows_per_page] for index in range(0, len(sheet["parts"]), rows_per_page)]
        for chunk_index, rows in enumerate(chunks):
            _draw_index(pdf, data, sheet, page_number, chunk_index + 1, len(chunks), rows)
            pdf.showPage()
            page_number += 1
    pdf.save()
    return output.getvalue()
