# Old Growth Reclaimed Woods · Inventory Management System

A focused, zero-dependency yard & warehouse inventory management system built directly from your actual business files for **Old Growth Reclaimed Woods** (Jim Morgan & Erin), integrating authentic timber tallies, milled flooring with Rey Florez, architectural salvage, and fine furnishings across your two operational facilities.

---

## Designated Locations

Presently, all company inventory is situated across two designated facilities:
1. **Florez Workshop** (`300 Race Ave Bldg 6, Waynesboro, VA 22980`):
   - In partnership with Rey Florez.
   - Houses heavy Longleaf Heart Pine structural timbers, reclaimed White Oak & Red Oak beams, milled quartersawn flooring, hit-and-miss paneling, siding, and active custom millwork orders.
2. **Old World Studio** (Showroom & Curated Archive · Waynesboro / Charlottesville, VA):
   - Houses Jim Morgan's architectural salvage collection, 19th-century fireplace mantels, antique doors, country store display fixtures, mid-century seating, and Chairish-ready art and vintage barware.

---

## Verified File Ingestions

Every cataloged item in this system is verified against your actual files:
- **17 Heart Pine Timber Bundles**: Parsed from [`OldGrowthReclaimedWoods/inventory/heart-pine-timber-inventory.html`](file:///C:/Users/erinf/OldGrowthReclaimedWoods/inventory/heart-pine-timber-inventory.html) (14,068 BF, authentic historic industrial demolition stock, verified by Jim Morgan).
- **11 Florez Millwork Finished Flooring & Siding Lots**: Parsed from [`Downloads/Florez Millworks Inventory -1-001/Florez Millworks Inventory/Visual_Catalog.html`](file:///C:/Users/erinf/Downloads/Florez%20Millworks%20Inventory%20-1-001/Florez%20Millworks%20Inventory/Visual_Catalog.html) with full dimensions, square footage, and direct photos (`item_1.jpg` through `item_11.jpg`).
- **34 Categorized Antiques & Furnishings**: Parsed from [`Jim_Morgan_Acquisitions/01_Inventory_Photos/Categorized`](file:///C:/Users/erinf/Jim_Morgan_Acquisitions/01_Inventory_Photos/Categorized) and [`Reclaimed Legacy Wood and Furnishings`](file:///C:/Users/erinf/Jim_Morgan_Acquisitions/01_Inventory_Photos/Reclaimed%20Legacy%20Wood%20and%20Furnishings) (109 high-resolution photos).
- **Chairish Active Listing**: Stork Club / El Morocco c.1950 Aluminum Cocktail Tray (SKU 22592, $1,800) from [`Chairish_Listing_Template.csv`](file:///C:/Users/erinf/Downloads/Chairish_Listing_Template.csv).

---

## Key Features

1. **Quick Stock Adjustment Steppers (`[-]` and `[+]`)**:
   - Easily add or deduct stock directly from the table row or grid card.
   - Deduct stock with recorded reasons (*Sold to Client*, *Dispatched to Mill*, *Used in Project*, *Damaged/Offcut*).
   - Automatically recalculates remaining Board Footage (BF) and Square Footage (Sq Ft). If pieces hit zero, marks lot as *Sold Out*.
   - Add incoming stock with recorded receipts.
2. **Internal Network Sharing (LAN)**:
   - Server binds to `0.0.0.0:3000`.
   - Access from any phone, tablet, iPad, or laptop on the workshop/studio Wi-Fi via:
     **`http://192.168.1.162:3000`**
   - Click the **"🔗 Share Internally"** button in the header for a one-click copy link.
3. **Dedicated Facility Overview**:
   - Compare and filter inventory between **Florez Workshop** and **Old World Studio**.
4. **On-Site Timber & Pricing Yard Calculator**:
   - Instant calculation of board feet, cubic volume, and piece/lot weight based on wood species density.
   - Pre-fills new stock entries with one click.
5. **Florez Millwork Tracking**:
   - Track service work orders dispatched to Rey Florez (resawing, planing, tongue-and-groove milling) with yield logging and return-to-inventory status.
6. **Omnichannel Listing Generator**:
   - Pre-formatted copy for Facebook Marketplace, Craigslist, and Chairish batch CSV exports.
7. **Database Safety & Audit Trail**:
   - Transaction logging for every stock modification and one-click SQLite database snapshots saved to [`data/backups/`](file:///C:/Users/erinf/OldGrowthReclaimedWoods/inventory-system/data/backups).

---

## Quick Start

### One-Click Launch (Windows)
Double-click [`start-inventory.bat`](file:///C:/Users/erinf/OldGrowthReclaimedWoods/inventory-system/start-inventory.bat) to launch the server and open the browser.

### Local & Wi-Fi Addresses
- **This computer:** [http://localhost:3000](http://localhost:3000)
- **Workshop/Studio Wi-Fi (phones & tablets):** [http://192.168.1.162:3000](http://192.168.1.162:3000)

### Data Re-Seeding
```powershell
npm run seed
```
