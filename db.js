const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const BUNDLED_DB_PATH = path.join(__dirname, 'data', 'inventory.db');
const VOLUME_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const DB_PATH = process.env.DB_PATH || (VOLUME_DIR ? path.join(VOLUME_DIR, 'inventory.db') : BUNDLED_DB_PATH);

// Ensure data and backup directories exist
const dataDir = path.dirname(DB_PATH);
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });

// If running with a Railway persistent volume and volume DB does not exist yet, seed from bundled DB
if (DB_PATH !== BUNDLED_DB_PATH && !fs.existsSync(DB_PATH) && fs.existsSync(BUNDLED_DB_PATH)) {
  try {
    fs.copyFileSync(BUNDLED_DB_PATH, DB_PATH);
    console.log(`[DB] Initialized persistent volume database at ${DB_PATH} from bundled snapshot.`);
  } catch (err) {
    console.error('[DB] Failed to copy bundled DB to volume:', err.message);
  }
}

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      unit_type TEXT DEFAULT 'pieces'
    );

    CREATE TABLE IF NOT EXISTS species (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'Hardwood',
      density_lbs_per_cuft REAL DEFAULT 45,
      historical_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Yard',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      category_code TEXT NOT NULL,
      name TEXT NOT NULL,
      species_material TEXT,
      dimensions_display TEXT,
      thickness_in REAL,
      width_in REAL,
      length_ft REAL,
      pieces INTEGER DEFAULT 1,
      board_feet REAL DEFAULT 0,
      square_feet REAL DEFAULT 0,
      linear_feet REAL DEFAULT 0,
      weight_lbs REAL DEFAULT 0,
      description TEXT,
      provenance_origin TEXT,
      year_built TEXT,
      historical_notes TEXT,
      condition TEXT,
      processing_needs TEXT,
      acquisition_cost REAL DEFAULT 0,
      price_per_unit REAL DEFAULT 0,
      price_unit_type TEXT DEFAULT 'BF',
      target_price REAL DEFAULT 0,
      target_buyer TEXT DEFAULT 'B2B / B2C',
      yard_location TEXT,
      status TEXT DEFAULT 'Available',
      bundle_ref TEXT,
      bay_location TEXT,
      lot_number INTEGER,
      flag_notes TEXT,
      verified_by TEXT,
      verified_date TEXT,
      cloud_photo_link TEXT,
      primary_photo TEXT,
      chairish_ready INTEGER DEFAULT 0,
      marketplace_ready INTEGER DEFAULT 0,
      website_featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      file_path TEXT,
      url_path TEXT NOT NULL,
      caption TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mill_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      service_type TEXT NOT NULL,
      miller TEXT DEFAULT 'Rey Florez · Florez Millwork',
      date_sent TEXT,
      estimated_completion TEXT,
      completed_date TEXT,
      status TEXT DEFAULT 'Queued',
      input_qty REAL,
      output_yield TEXT,
      cost REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      user_name TEXT DEFAULT 'Jim Morgan / Erin',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  try {
    db.exec('ALTER TABLE items ADD COLUMN bay_location TEXT;');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  // Ensure Siding & Paneling (SID) and Review (REV) categories exist, and normalize !!_REVIEW -> REV
  try {
    db.exec(`
      INSERT OR IGNORE INTO categories (code, name, description, unit_type)
      VALUES 
        ('SID', 'Siding & Paneling', 'Reclaimed barn siding, skin paneling, and weathered wall cladding', 'sq_ft'),
        ('REV', 'Needs Review (REV)', 'Flagged or uncounted lots pending manual verification', 'pieces');
      UPDATE items SET category_code = 'REV' WHERE category_code = '!!_REVIEW';
      DELETE FROM categories WHERE code = '!!_REVIEW';
    `);
  } catch (err) {
    // Ignore if error
  }
}

function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(__dirname, 'data', 'backups', `inventory-${timestamp}.db`);
  try {
    fs.copyFileSync(DB_PATH, backupFile);
    return backupFile;
  } catch (err) {
    console.error('Backup error:', err);
    return null;
  }
}

module.exports = {
  getDb,
  backupDatabase,
  DB_PATH
};
