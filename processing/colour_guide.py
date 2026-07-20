"""Printable paint-buying and terrain-layer colour guide generation."""

from __future__ import annotations

import io
import math
from pathlib import Path
from typing import Any

import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = A4
FOREST = colors.HexColor("#214f3d")
MUTED = colors.HexColor("#61736a")
LINE = colors.HexColor("#b7c1b8")
PAPER = colors.HexColor("#faf8f2")
ROW_FILL = colors.HexColor("#f0f3ef")
FONT = "Topomapper"
FONT_BOLD = "Topomapper-Bold"

_font_directory = Path(reportlab.__file__).resolve().parent / "fonts"
_mac_font_directory = Path("/System/Library/Fonts/Supplemental")
_regular_font = _mac_font_directory / "Arial.ttf"
_bold_font = _mac_font_directory / "Arial Bold.ttf"
pdfmetrics.registerFont(TTFont(FONT, str(_regular_font if _regular_font.exists() else _font_directory / "Vera.ttf")))
pdfmetrics.registerFont(TTFont(FONT_BOLD, str(_bold_font if _bold_font.exists() else _font_directory / "VeraBd.ttf")))


class ColourGuideError(ValueError):
    """Raised when a colour-guide request is incomplete or malformed."""


def _number(value: Any, name: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ColourGuideError(f"{name} must be a number.") from error
    if not math.isfinite(result):
        raise ColourGuideError(f"{name} must be finite.")
    return result


def _text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _clean_payload(payload: dict[str, Any]) -> dict[str, Any]:
    paints = payload.get("paints")
    layers = payload.get("layers")
    if not isinstance(paints, list) or not paints:
        raise ColourGuideError("At least one paint colour is required.")
    if not isinstance(layers, list) or not layers:
        raise ColourGuideError("At least one terrain layer is required.")
    if len(paints) > 20 or len(layers) > 100:
        raise ColourGuideError("The colour guide contains too many paints or layers.")

    clean_paints: list[dict[str, Any]] = []
    for paint in paints:
        if not isinstance(paint, dict):
            raise ColourGuideError("A paint entry is malformed.")
        hex_value = _text(paint.get("hex"), 7)
        try:
            colour = colors.HexColor(hex_value)
        except Exception as error:
            raise ColourGuideError("A paint swatch colour is invalid.") from error
        layer_numbers = paint.get("layers")
        if not isinstance(layer_numbers, list):
            raise ColourGuideError("A paint entry has no layer list.")
        clean_paints.append({
            "manufacturer": _text(paint.get("manufacturer"), 80),
            "code": _text(paint.get("code"), 30),
            "name": _text(paint.get("name"), 80),
            "note": _text(paint.get("note"), 140),
            "colour": colour,
            "layers": [int(number) for number in layer_numbers[:100]],
            "minimum": _number(paint.get("minimum"), "Paint minimum elevation"),
            "maximum": _number(paint.get("maximum"), "Paint maximum elevation"),
        })

    clean_layers: list[dict[str, Any]] = []
    for layer in layers:
        if not isinstance(layer, dict):
            raise ColourGuideError("A layer entry is malformed.")
        clean_layers.append({
            "number": int(layer.get("number")),
            "minimum": _number(layer.get("minimum"), "Layer minimum elevation"),
            "maximum": _number(layer.get("maximum"), "Layer maximum elevation"),
            "code": _text(layer.get("code"), 30),
            "name": _text(layer.get("name"), 80),
            "manufacturer": _text(layer.get("manufacturer"), 80),
            "note": _text(layer.get("note"), 140),
            "hex": _text(layer.get("hex"), 7),
        })

    return {
        "project": _text(payload.get("project_name"), 120) or "Topomapper project",
        "material": _number(payload.get("material_thickness_mm"), "Material thickness"),
        "snow": _text(payload.get("snow_mode"), 80),
        "paints": clean_paints,
        "layers": sorted(clean_layers, key=lambda layer: layer["number"]),
    }


def _header(pdf: canvas.Canvas, data: dict[str, Any], subtitle: str) -> None:
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    pdf.setFillColor(FOREST)
    pdf.setFont(FONT_BOLD, 16)
    pdf.drawString(36, PAGE_HEIGHT - 34, data["project"])
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT, 8)
    pdf.drawRightString(PAGE_WIDTH - 36, PAGE_HEIGHT - 30, subtitle)
    pdf.setStrokeColor(LINE)
    pdf.line(36, PAGE_HEIGHT - 43, PAGE_WIDTH - 36, PAGE_HEIGHT - 43)


def _footer(pdf: canvas.Canvas, page_number: int) -> None:
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT, 6.8)
    pdf.drawString(36, 24, "Display swatches are buying guidance only. Confirm paint on the intended primed material.")
    pdf.drawRightString(PAGE_WIDTH - 36, 24, f"Topomapper colour chart - page {page_number}")


def _fit_text(pdf: canvas.Canvas, text: str, x: float, y: float, maximum_width: float, font: str, size: float) -> None:
    value = text
    while value and pdfmetrics.stringWidth(value, font, size) > maximum_width:
        value = value[:-1]
    if value != text and len(value) > 2:
        value = value[:-2] + "..."
    pdf.setFont(font, size)
    pdf.drawString(x, y, value)


def _paint_cards(pdf: canvas.Canvas, data: dict[str, Any]) -> float:
    pdf.setFillColor(FOREST)
    pdf.setFont(FONT_BOLD, 9)
    pdf.drawString(36, PAGE_HEIGHT - 63, "PAINTS TO BUY")
    pdf.setFillColor(MUTED)
    pdf.setFont(FONT, 7)
    pdf.drawRightString(PAGE_WIDTH - 36, PAGE_HEIGHT - 63, f"{len(data['layers'])} layers - {data['material']:g} mm material - snow: {data['snow']}")
    card_gap = 8.0
    card_width = (PAGE_WIDTH - 72.0 - card_gap) / 2
    card_height = 76.0
    start_y = PAGE_HEIGHT - 78.0
    for index, paint in enumerate(data["paints"]):
        column = index % 2
        row = index // 2
        x = 36.0 + column * (card_width + card_gap)
        top = start_y - row * (card_height + card_gap)
        bottom = top - card_height
        pdf.setFillColor(colors.white)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(x, bottom, card_width, card_height, 5, fill=1, stroke=1)
        pdf.setFillColor(paint["colour"])
        pdf.roundRect(x, bottom, 56, card_height, 5, fill=1, stroke=0)
        text_x = x + 68
        pdf.setFillColor(MUTED)
        _fit_text(pdf, paint["manufacturer"], text_x, top - 15, card_width - 78, FONT, 6.7)
        pdf.setFillColor(FOREST)
        _fit_text(pdf, f"{paint['code']}  {paint['name']}", text_x, top - 30, card_width - 78, FONT_BOLD, 9)
        pdf.setFillColor(MUTED)
        layers = ", ".join(str(number) for number in paint["layers"])
        _fit_text(pdf, f"Layers {layers}  |  {paint['minimum']:g}-{paint['maximum']:g} m", text_x, top - 44, card_width - 78, FONT, 6.8)
        _fit_text(pdf, paint["note"] or "Alternative: ____________________", text_x, top - 59, card_width - 78, FONT, 6.8)
    rows = math.ceil(len(data["paints"]) / 2)
    return start_y - rows * (card_height + card_gap) - 2


def _table_header(pdf: canvas.Canvas, y: float) -> float:
    columns = [(38, "LAYER"), (82, "ELEVATION"), (167, "SWATCH"), (220, "PAINT"), (410, "SHOP EQUIVALENT / NOTES")]
    pdf.setFillColor(FOREST)
    pdf.setFont(FONT_BOLD, 6.7)
    for x, label in columns:
        pdf.drawString(x, y, label)
    pdf.setStrokeColor(LINE)
    pdf.line(36, y - 6, PAGE_WIDTH - 36, y - 6)
    return y - 20


def _layer_rows(pdf: canvas.Canvas, layers: list[dict[str, Any]], y: float) -> float:
    row_height = 17.0
    for index, layer in enumerate(layers):
        if index % 2 == 0:
            pdf.setFillColor(ROW_FILL)
            pdf.rect(36, y - 5, PAGE_WIDTH - 72, row_height, fill=1, stroke=0)
        pdf.setFillColor(FOREST)
        pdf.setFont(FONT_BOLD, 7.2)
        pdf.drawString(40, y, f"L{layer['number']:02d}")
        pdf.setFont(FONT, 7)
        pdf.drawString(82, y, f"{layer['minimum']:g}-{layer['maximum']:g} m")
        try:
            pdf.setFillColor(colors.HexColor(layer["hex"]))
        except Exception:
            pdf.setFillColor(colors.white)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(168, y - 4, 37, 11, 2, fill=1, stroke=1)
        pdf.setFillColor(FOREST)
        _fit_text(pdf, f"{layer['code']}  {layer['name']}", 220, y, 180, FONT_BOLD, 7)
        pdf.setFillColor(MUTED)
        _fit_text(pdf, layer["note"] or "-", 410, y, PAGE_WIDTH - 448, FONT, 6.8)
        y -= row_height
    return y


def generate_colour_guide(payload: dict[str, Any]) -> bytes:
    """Return an A4 PDF containing paint purchase cards and layer assignments."""
    data = _clean_payload(payload)
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4, pageCompression=1)
    pdf.setTitle(f"{data['project']} - colour chart")
    pdf.setAuthor("Topomapper")
    page_number = 1

    _header(pdf, data, "Paint purchase and terrain-layer plan")
    y = _paint_cards(pdf, data)
    y = _table_header(pdf, y)
    available_first = max(1, int((y - 48) // 17))
    first_rows = data["layers"][:available_first]
    _layer_rows(pdf, first_rows, y)
    _footer(pdf, page_number)
    remaining = data["layers"][available_first:]

    while remaining:
        pdf.showPage()
        page_number += 1
        _header(pdf, data, "Layer paint schedule - continued")
        y = _table_header(pdf, PAGE_HEIGHT - 66)
        rows_per_page = max(1, int((y - 48) // 17))
        rows, remaining = remaining[:rows_per_page], remaining[rows_per_page:]
        _layer_rows(pdf, rows, y)
        _footer(pdf, page_number)

    pdf.save()
    return output.getvalue()
