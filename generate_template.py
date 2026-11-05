import os
import csv
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HEADERS = [
    "Lot_Number",
    "Title",
    "Location",
    "Category",
    "Species",
    "Dimensions",
    "Thickness_In",
    "Width_In",
    "Length_Ft",
    "Pieces",
    "Square_Feet",
    "Board_Feet",
    "Condition",
    "Price_Per_Unit",
    "Price_Unit_Type",
    "Target_Price",
    "Status",
    "Tag_Notes"
]

SAMPLE_ROWS = [
    [
        1,
        "Select Quartersawn Heart Pine Flooring",
        "Florez Workshop",
        "FLR",
        "Heart Pine",
        "3.25\" wide",
        0.75,
        3.25,
        12.0,
        192,
        575.0,
        431.3,
        "New Surface",
        15.00,
        "SqFt",
        8625.00,
        "Available",
        "Milled in Shenandoah Valley by Florez Millwork. Straight vertical grain."
    ],
    [
        2,
        "Fresh Surface White Oak Flooring",
        "Florez Workshop",
        "FLR",
        "White Oak",
        "5\" wide",
        0.75,
        5.0,
        12.0,
        341,
        1024.0,
        768.0,
        "New Surface",
        10.00,
        "SqFt",
        10240.00,
        "Available",
        "Large lot of 5-inch wide White Oak with freshly milled surface."
    ],
    [
        3,
        "Hit and Miss Oak Flooring",
        "Florez Workshop",
        "FLR",
        "White Oak",
        "4.5\" wide",
        0.75,
        4.5,
        12.0,
        200,
        600.0,
        450.0,
        "Hit & Miss",
        10.00,
        "SqFt",
        6000.00,
        "Available",
        "Leaves original rustic saw marks and patina intact while smooth planed."
    ],
    [
        4,
        "Reclaimed Heart Pine Timbers · Lot 01",
        "Florez Workshop",
        "TIM",
        "Heart Pine",
        "8x10 x 16'",
        8.0,
        10.0,
        16.0,
        10,
        854.0,
        1067.0,
        "Rough Sawn",
        14.50,
        "BF",
        15471.50,
        "Available",
        "Heavy industrial structural timbers, de-nailed, bundled and banded."
    ]
]

# 1. Write CSV Template
def write_csv(filepath):
    with open(filepath, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADERS)
        for row in SAMPLE_ROWS:
            writer.writerow(row)
    print(f"[OK] CSV written to {filepath}")

# 2. Write Excel Styled Workbook
def write_xlsx(filepath):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Inventory Tag Data"

    # Styling colors
    walnut_dark = "2F1C13"
    gold_accent = "C8A57C"
    gold_light = "F7EEDF"
    border_color = "D3C5B4"
    zebra_bg = "FAF7F2"

    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color=walnut_dark, end_color=walnut_dark, fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    thin_border = Border(
        left=Side(style="thin", color=border_color),
        right=Side(style="thin", color=border_color),
        top=Side(style="thin", color=border_color),
        bottom=Side(style="thin", color=border_color)
    )

    # Write Headers
    ws.row_dimensions[1].height = 34
    for col_idx, header in enumerate(HEADERS, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align
        cell.border = thin_border

    # Data formatting
    data_font = Font(name="Segoe UI", size=10)
    bold_font = Font(name="Segoe UI", size=10, bold=True)
    currency_font = Font(name="Segoe UI", size=10, bold=True, color="166534")

    for row_idx, row_data in enumerate(SAMPLE_ROWS, 2):
        ws.row_dimensions[row_idx].height = 24
        bg_fill = PatternFill(start_color=gold_light if row_idx % 2 == 0 else zebra_bg, 
                              end_color=gold_light if row_idx % 2 == 0 else zebra_bg, 
                              fill_type="solid")

        for col_idx, val in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = data_font
            cell.fill = bg_fill
            cell.border = thin_border

            # Specific column alignments & number formats
            if col_idx in [1, 7, 8, 9, 10, 11, 12]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in [14, 16]:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = "$#,##0.00"
                if col_idx == 16:
                    cell.font = currency_font
            elif col_idx in [3, 4, 13, 15, 17]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

    # Add 25 blank formatted template rows ready for direct entry
    for row_idx in range(len(SAMPLE_ROWS) + 2, len(SAMPLE_ROWS) + 30):
        ws.row_dimensions[row_idx].height = 22
        for col_idx in range(1, len(HEADERS) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
            if col_idx in [1, 7, 8, 9, 10, 11, 12, 3, 4, 13, 15, 17]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_idx in [14, 16]:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.number_format = "$#,##0.00"

    # Add Dropdown Validations
    loc_val = DataValidation(type="list", formula1='"Florez Workshop,Old World Studio"', allow_blank=True)
    cat_val = DataValidation(type="list", formula1='"FLR,TIM,ARC,FUR,ART,HDW,MISC"', allow_blank=True)
    status_val = DataValidation(type="list", formula1='"Available,Reserved,In Mill Processing,Sold Out"', allow_blank=True)
    unit_val = DataValidation(type="list", formula1='"SqFt,BF,Each,LinFt"', allow_blank=True)
    cond_val = DataValidation(type="list", formula1='"New Surface,Hit & Miss,Rough Sawn,Original Patina,Good / Reclaimed"', allow_blank=True)

    ws.add_data_validation(loc_val)
    ws.add_data_validation(cat_val)
    ws.add_data_validation(status_val)
    ws.add_data_validation(unit_val)
    ws.add_data_validation(cond_val)

    loc_val.add("C2:C100")
    cat_val.add("D2:D100")
    cond_val.add("M2:M100")
    unit_val.add("O2:O100")
    status_val.add("Q2:Q100")

    # Auto-fit Column Widths with nice padding
    col_widths = {
        "A": 12, # Lot_Number
        "B": 36, # Title
        "C": 18, # Location
        "D": 12, # Category
        "E": 20, # Species
        "F": 16, # Dimensions
        "G": 14, # Thickness_In
        "H": 12, # Width_In
        "I": 12, # Length_Ft
        "J": 10, # Pieces
        "K": 14, # Square_Feet
        "L": 14, # Board_Feet
        "M": 16, # Condition
        "N": 15, # Price_Per_Unit
        "O": 16, # Price_Unit_Type
        "P": 16, # Target_Price
        "Q": 16, # Status
        "R": 45  # Tag_Notes
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    # Add Sheet 2: Field Guide & Instructions
    guide_ws = wb.create_sheet(title="Field Guide & Instructions")
    guide_ws.views.sheetView[0].showGridLines = True

    guide_headers = ["Column Header", "Description & Physical Tag Mapping", "Accepted Values / Examples", "Required?"]
    guide_rows = [
        ["Lot_Number", "Physical lot number or tag index (e.g. Lot # on bunk tag)", "1, 2, 3...", "Optional (auto-numbered if blank)"],
        ["Title", "Product name on tag (e.g. White Oak Flooring, Heart Pine Beams)", "Select Quartersawn Heart Pine", "Required"],
        ["Location", "Designated workshop or studio facility", "Florez Workshop or Old World Studio", "Defaults to chosen upload location"],
        ["Category", "Inventory classification code", "FLR (Flooring), TIM (Timbers), ARC (Salvage), FUR (Furniture)", "Recommended"],
        ["Species", "Wood species noted on tag", "Heart Pine, White Oak, Red Oak, White Pine, Poplar, Walnut", "Recommended"],
        ["Dimensions", "Display dimension string", '3.25" wide, 8" x 10" x 16\', Mixed 8" & 10.5"', "Optional"],
        ["Thickness_In", "Board / beam thickness in inches", "0.75, 1.0, 8.0", "Optional"],
        ["Width_In", "Board / beam width in inches", "3.25, 5.0, 7.0, 10.0", "Optional"],
        ["Length_Ft", "Board / beam span length in feet", "12.0, 14.0, 16.0", "Optional"],
        ["Pieces", "Total count of individual pieces in bunk / bundle", "10, 143, 200", "Optional"],
        ["Square_Feet", "Total square footage coverage (flooring, siding, paneling)", "575, 1024, 600", "Recommended for FLR"],
        ["Board_Feet", "Total board feet volume (timbers, beams, raw lumber)", "1067, 933, 747", "Recommended for TIM"],
        ["Condition", "Surface milling or patina condition from tag", "New Surface, Hit & Miss, Rough Sawn, Original Patina", "Optional"],
        ["Price_Per_Unit", "Sale rate per BF, per Sq Ft, or per Piece", "15.00, 10.00, 14.50", "Optional"],
        ["Price_Unit_Type", "Pricing unit type", "SqFt, BF, Each", "Optional"],
        ["Target_Price", "Total lot retail sale price", "8625.00, 10240.00, 6000.00", "Recommended"],
        ["Status", "Inventory lot availability status", "Available, Reserved, In Mill Processing, Sold Out", "Defaults to Available"],
        ["Tag_Notes", "Historical provenance, saw marks, grain density, bay location", "Milled by Florez Millwork; de-nailed timbers; Bay 4", "Optional"]
    ]

    guide_ws.row_dimensions[1].height = 30
    for col_idx, h in enumerate(guide_headers, 1):
        cell = guide_ws.cell(row=1, column=col_idx, value=h)
        cell.font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color=walnut_dark, end_color=walnut_dark, fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    for row_idx, r_data in enumerate(guide_rows, 2):
        guide_ws.row_dimensions[row_idx].height = 22
        for col_idx, val in enumerate(r_data, 1):
            cell = guide_ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = Font(name="Segoe UI", size=10, bold=(col_idx==1))
            cell.border = thin_border
            if col_idx == 4:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = Font(name="Segoe UI", size=10, italic=True, color="166534" if "Required" in val else "6F625A")

    guide_col_widths = {"A": 18, "B": 50, "C": 45, "D": 26}
    for col_letter, width in guide_col_widths.items():
        guide_ws.column_dimensions[col_letter].width = width

    wb.save(filepath)
    print(f"[OK] Styled Excel Template written to {filepath}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(base_dir, "public")
    downloads_dir = "C:\\Users\\erinf\\Downloads"

    # Save to public directory for direct in-browser download
    write_csv(os.path.join(public_dir, "Old_Growth_Inventory_Tag_Template.csv"))
    write_xlsx(os.path.join(public_dir, "Old_Growth_Inventory_Tag_Template.xlsx"))

    # Save directly to Downloads for Erin's immediate access in Google Sheets / Excel
    write_csv(os.path.join(downloads_dir, "Old_Growth_Inventory_Tag_Template.csv"))
    write_xlsx(os.path.join(downloads_dir, "Old_Growth_Inventory_Tag_Template.xlsx"))
