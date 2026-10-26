const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pipeline } = require('node:stream');
const { getDb, backupDatabase, DB_PATH } = require('./db.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Directory roots for photos (cloud-portable + local fallbacks)
const LOCAL_PHOTOS_DIR = path.join(PUBLIC_DIR, 'assets', 'photos');
const PHOTO_ROOTS = {
  categorized: fs.existsSync(path.join(LOCAL_PHOTOS_DIR, 'categorized')) 
    ? path.join(LOCAL_PHOTOS_DIR, 'categorized') 
    : 'C:\\Users\\erinf\\Jim_Morgan_Acquisitions\\01_Inventory_Photos\\Categorized',
  reclaimed: fs.existsSync(path.join(LOCAL_PHOTOS_DIR, 'categorized')) 
    ? path.join(LOCAL_PHOTOS_DIR, 'categorized') 
    : 'C:\\Users\\erinf\\Jim_Morgan_Acquisitions\\01_Inventory_Photos\\Reclaimed Legacy Wood and Furnishings',
  raw: fs.existsSync(path.join(LOCAL_PHOTOS_DIR, 'categorized')) 
    ? path.join(LOCAL_PHOTOS_DIR, 'categorized') 
    : 'C:\\Users\\erinf\\Jim_Morgan_Acquisitions\\01_Inventory_Photos\\Reclaimed Legacy Wood and Furnishings',
  florez: fs.existsSync(path.join(LOCAL_PHOTOS_DIR, 'florez')) 
    ? path.join(LOCAL_PHOTOS_DIR, 'florez') 
    : 'C:\\Users\\erinf\\Downloads\\Florez Millworks Inventory -1-001\\Florez Millworks Inventory\\processed_images',
  inventory: fs.existsSync(path.join(PUBLIC_DIR, 'assets')) 
    ? path.join(PUBLIC_DIR, 'assets') 
    : 'C:\\Users\\erinf\\OldGrowthReclaimedWoods\\inventory',
  website: fs.existsSync(path.join(PUBLIC_DIR, 'assets')) 
    ? path.join(PUBLIC_DIR, 'assets') 
    : 'C:\\Users\\erinf\\OldGrowthReclaimedWoods\\website'
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

// Helper to get local network IPv4 addresses
function getNetworkIps() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push({ name, address: net.address });
      }
    }
  }
  return results;
}

// Helper to log user/system actions in inventory_logs
function logAction(db, itemId, action, details, user = 'Erin / Jim Morgan') {
  try {
    const stmt = db.prepare(`
      INSERT INTO inventory_logs (item_id, action, details, user_name)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(itemId, action, details, user);
  } catch (err) {
    console.error('Failed to log action:', err.message);
  }
}

// Calculate board feet and weight based on dimensions and species
function calculateMetrics(item, db) {
  const t = parseFloat(item.thickness_in) || 0;
  const w = parseFloat(item.width_in) || 0;
  const l = parseFloat(item.length_ft) || 0;
  const pcs = parseInt(item.pieces) || 1;

  let bf = 0;
  if (t > 0 && w > 0 && l > 0) {
    bf = Math.round(((t * w * l) / 12) * pcs * 100) / 100;
  } else if (item.board_feet) {
    bf = parseFloat(item.board_feet) || 0;
  }

  let density = 42; // default antique wood density
  if (item.species_material) {
    try {
      const sp = db.prepare('SELECT density_lbs_per_cuft FROM species WHERE name LIKE ? LIMIT 1')
                   .get(`%${item.species_material.split(' ')[0]}%`);
      if (sp && sp.density_lbs_per_cuft) {
        density = sp.density_lbs_per_cuft;
      }
    } catch (e) {}
  }

  let weight = 0;
  if (bf > 0) {
    weight = Math.round((bf / 12) * density);
  } else if (item.weight_lbs) {
    weight = parseFloat(item.weight_lbs) || 0;
  }

  return { board_feet: bf, weight_lbs: weight };
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getTunnelInfo() {
  const tunnelFile = path.join(__dirname, 'tunnel_info.json');
  if (fs.existsSync(tunnelFile)) {
    try {
      return JSON.parse(fs.readFileSync(tunnelFile, 'utf8'));
    } catch (e) {}
  }
  return { url: null, status: 'inactive' };
}

function sendJson(res, statusCode, data, reqMethod) {
  if (res.writableEnded || res.destroyed) return;
  try {
    const json = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    if (reqMethod === 'HEAD') {
      res.end();
    } else {
      res.end(json);
    }
  } catch (err) {
    // Client aborted connection mid-send, safely ignore
  }
}

function generatePlaceholderSvg(title = 'Old Growth Reclaimed Woods') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#2f1c13"/>
    <rect x="20" y="20" width="560" height="360" fill="none" stroke="#c8a57c" stroke-width="2" stroke-dasharray="8 4"/>
    <circle cx="300" cy="170" r="48" fill="#4e2d1e" stroke="#c8a57c" stroke-width="2"/>
    <text x="300" y="180" font-family="Georgia, serif" font-size="28" fill="#f7f3ec" text-anchor="middle">OG</text>
    <text x="300" y="250" font-family="Georgia, serif" font-size="18" fill="#c8a57c" text-anchor="middle" font-weight="bold">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
    <text x="300" y="278" font-family="sans-serif" font-size="12" fill="#d3e6e8" text-anchor="middle">Old Growth Reclaimed Woods · Catalog Archive</text>
  </svg>`;
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const db = getDb();

  // -------------------------------------------------------------------------
  // PHOTO STREAMING: /api/photos/...
  // -------------------------------------------------------------------------
  if (pathname.startsWith('/api/photos/')) {
    const photoSub = pathname.replace('/api/photos/', '');
    let resolvedFilePath = null;

    if (photoSub.startsWith('categorized/')) {
      resolvedFilePath = path.join(PHOTO_ROOTS.categorized, photoSub.replace('categorized/', ''));
    } else if (photoSub.startsWith('reclaimed/')) {
      resolvedFilePath = path.join(PHOTO_ROOTS.reclaimed, photoSub.replace('reclaimed/', ''));
    } else if (photoSub.startsWith('raw/')) {
      resolvedFilePath = path.join(PHOTO_ROOTS.raw, photoSub.replace('raw/', ''));
    } else if (photoSub.startsWith('florez/')) {
      resolvedFilePath = path.join(PHOTO_ROOTS.florez, photoSub.replace('florez/', ''));
    } else if (photoSub.startsWith('inventory/')) {
      resolvedFilePath = path.join(PHOTO_ROOTS.inventory, photoSub.replace('inventory/', ''));
    } else if (photoSub.startsWith('website/')) {
      resolvedFilePath = path.join(PHOTO_ROOTS.website, photoSub.replace('website/', ''));
    }

    // Try finding in database if not found via pattern
    if (!resolvedFilePath || !fs.existsSync(resolvedFilePath)) {
      try {
        const photoRecord = db.prepare('SELECT file_path FROM photos WHERE url_path = ? OR url_path LIKE ? LIMIT 1')
                              .get(pathname, `%${path.basename(pathname)}%`);
        if (photoRecord && photoRecord.file_path && fs.existsSync(photoRecord.file_path)) {
          resolvedFilePath = photoRecord.file_path;
        }
      } catch (err) {}
    }

    // Fallback: check direct file in local photos directory
    if (!resolvedFilePath || !fs.existsSync(resolvedFilePath)) {
      const directCandidate = path.join(LOCAL_PHOTOS_DIR, path.basename(pathname));
      if (fs.existsSync(directCandidate)) {
        resolvedFilePath = directCandidate;
      }
    }

    if (resolvedFilePath && fs.existsSync(resolvedFilePath)) {
      const ext = path.extname(resolvedFilePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      if (method === 'HEAD') {
        return res.end();
      }
      const readStream = fs.createReadStream(resolvedFilePath);
      pipeline(readStream, res, (err) => {
        // Premature closes or connection resets on mobile are normal; ignore them
      });
      return;
    } else {
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600'
      });
      return res.end(generatePlaceholderSvg(path.basename(pathname)));
    }
  }

  // -------------------------------------------------------------------------
  // REST API ROUTES: /api/...
  // -------------------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    try {
      // 0. HEALTH CHECK
      if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
        return sendJson(res, 200, {
          status: 'ok',
          uptime: Math.round(process.uptime()),
          memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          timestamp: new Date().toISOString()
        }, method);
      }

      // 0.1 TUNNEL STATUS & URL
      if (pathname === '/api/tunnel' && (method === 'GET' || method === 'HEAD')) {
        return sendJson(res, 200, getTunnelInfo(), method);
      }

      // 0.2 NETWORK INFORMATION (INTERNAL SHARE & REMOTE)
      if (pathname === '/api/network-info' && method === 'GET') {
        const ips = getNetworkIps();
        const primaryIp = ips.length > 0 ? ips[0].address : 'localhost';
        const tunnelInfo = getTunnelInfo();
        return sendJson(res, 200, {
          localUrl: `http://localhost:${PORT}`,
          networkUrl: `http://${primaryIp}:${PORT}`,
          tunnelUrl: tunnelInfo.url || null,
          tunnelStatus: tunnelInfo.status || 'inactive',
          ip: primaryIp,
          hostname: os.hostname(),
          allInterfaces: ips
        });
      }

      // 1. STATS / SUMMARY
      if (pathname === '/api/stats' && method === 'GET') {
        const summary = db.prepare(`
          SELECT 
            COUNT(*) as total_items,
            SUM(board_feet) as total_board_feet,
            SUM(square_feet) as total_square_feet,
            SUM(target_price) as total_valuation,
            SUM(pieces) as total_pieces,
            SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_items,
            SUM(CASE WHEN status = 'Reserved' THEN 1 ELSE 0 END) as reserved_items,
            SUM(CASE WHEN status IN ('Sold', 'Sold Out') THEN 1 ELSE 0 END) as sold_items,
            SUM(CASE WHEN status = 'In Mill Processing' THEN 1 ELSE 0 END) as in_mill_items,
            SUM(CASE WHEN chairish_ready = 1 THEN 1 ELSE 0 END) as chairish_items,
            SUM(CASE WHEN marketplace_ready = 1 THEN 1 ELSE 0 END) as marketplace_items,
            SUM(CASE WHEN yard_location = 'Florez Workshop' THEN 1 ELSE 0 END) as florez_count,
            SUM(CASE WHEN yard_location = 'Old World Studio' THEN 1 ELSE 0 END) as studio_count
          FROM items
        `).get();

        const categories = db.prepare(`
          SELECT 
            c.code, c.name, c.unit_type,
            COUNT(i.id) as item_count,
            COALESCE(SUM(i.board_feet), 0) as total_bf,
            COALESCE(SUM(i.square_feet), 0) as total_sqft,
            COALESCE(SUM(i.target_price), 0) as total_val
          FROM categories c
          LEFT JOIN items i ON c.code = i.category_code
          GROUP BY c.code
          ORDER BY total_val DESC
        `).all();

        const locations = db.prepare(`
          SELECT 
            yard_location as name,
            COUNT(*) as count,
            COALESCE(SUM(board_feet), 0) as total_bf,
            COALESCE(SUM(square_feet), 0) as total_sqft,
            COALESCE(SUM(target_price), 0) as total_val
          FROM items
          GROUP BY yard_location
          ORDER BY count DESC
        `).all();

        const activeMillJobs = db.prepare(`
          SELECT COUNT(*) as count FROM mill_jobs WHERE status IN ('Queued', 'In Progress')
        `).get().count;

        return sendJson(res, 200, {
          summary,
          categories,
          locations,
          activeMillJobs
        });
      }

      // 2. ITEMS LIST / SEARCH / FILTER
      if (pathname === '/api/items' && (method === 'GET' || method === 'HEAD')) {
        const q = Object.fromEntries(reqUrl.searchParams);
        let sql = `
          SELECT 
            i.*,
            c.name as category_name,
            COALESCE(NULLIF(i.primary_photo, ''), (SELECT p.url_path FROM photos p WHERE p.item_id = i.id ORDER BY p.is_primary DESC, p.id ASC LIMIT 1), '/assets/photos/beams.jpg') as primary_photo,
            (SELECT COUNT(*) FROM photos p WHERE p.item_id = i.id) as photo_count
          FROM items i
          LEFT JOIN categories c ON i.category_code = c.code
          WHERE 1=1
        `;
        const params = [];

        if (q.search) {
          sql += ` AND (
            i.sku LIKE ? OR 
            i.name LIKE ? OR 
            i.species_material LIKE ? OR 
            i.description LIKE ? OR 
            i.provenance_origin LIKE ? OR
            i.yard_location LIKE ?
          )`;
          const term = `%${q.search}%`;
          params.push(term, term, term, term, term, term);
        }

        if (q.category && q.category !== 'ALL') {
          sql += ` AND i.category_code = ?`;
          params.push(q.category);
        }

        if (q.species && q.species !== 'ALL') {
          sql += ` AND i.species_material LIKE ?`;
          params.push(`%${q.species}%`);
        }

        if (q.status && q.status !== 'ALL') {
          sql += ` AND i.status = ?`;
          params.push(q.status);
        }

        if (q.location && q.location !== 'ALL') {
          sql += ` AND i.yard_location = ?`;
          params.push(q.location);
        }

        // Logical Sorting
        if (q.sortBy === 'catalog' || !q.sortBy || q.sortBy === 'id' || q.sortBy === 'id_asc') {
          sql += ` ORDER BY CASE 
            WHEN i.yard_location = 'Florez Workshop' AND i.category_code = 'TIM' THEN 1 
            WHEN i.yard_location = 'Florez Workshop' THEN 2 
            ELSE 3 
          END ASC, COALESCE(i.lot_number, 9999) ASC, i.id ASC`;
        } else if (q.sortBy === 'lot_asc') {
          sql += ` ORDER BY COALESCE(i.lot_number, 9999) ASC, i.sku ASC`;
        } else if (q.sortBy === 'florez_first' || q.sortBy === 'loc_florez') {
          sql += ` ORDER BY CASE WHEN i.yard_location = 'Florez Workshop' THEN 1 ELSE 2 END ASC, i.id ASC`;
        } else if (q.sortBy === 'studio_first' || q.sortBy === 'loc_studio') {
          sql += ` ORDER BY CASE WHEN i.yard_location = 'Old World Studio' THEN 1 ELSE 2 END ASC, i.id ASC`;
        } else if (q.sortBy === 'name_asc') {
          sql += ` ORDER BY i.name ASC`;
        } else if (q.sortBy === 'price_desc') {
          sql += ` ORDER BY i.target_price DESC`;
        } else if (q.sortBy === 'price_asc') {
          sql += ` ORDER BY i.target_price ASC`;
        } else if (q.sortBy === 'bf_desc') {
          sql += ` ORDER BY i.board_feet DESC`;
        } else if (q.sortBy === 'sku_asc') {
          sql += ` ORDER BY i.sku ASC`;
        } else {
          const validSortCols = ['id', 'sku', 'name', 'board_feet', 'square_feet', 'target_price', 'pieces', 'category_code', 'status', 'yard_location'];
          const sortCol = validSortCols.includes(q.sortBy) ? q.sortBy : 'id';
          const sortDir = (q.sortDir && q.sortDir.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
          sql += ` ORDER BY i.${sortCol} ${sortDir}`;
        }

        const items = db.prepare(sql).all(...params);
        return sendJson(res, 200, items);
      }

      // 3. SINGLE ITEM DETAILS
      const itemMatch = pathname.match(/^\/api\/items\/(\d+)$/);
      if (itemMatch && method === 'GET') {
        const itemId = parseInt(itemMatch[1]);
        const item = db.prepare(`
          SELECT i.*, c.name as category_name 
          FROM items i 
          LEFT JOIN categories c ON i.category_code = c.code 
          WHERE i.id = ?
        `).get(itemId);

        if (!item) {
          return sendJson(res, 404, { error: 'Item not found' });
        }

        const photos = db.prepare('SELECT * FROM photos WHERE item_id = ? ORDER BY is_primary DESC, id ASC').all(itemId);
        const millJobs = db.prepare('SELECT * FROM mill_jobs WHERE item_id = ? ORDER BY id DESC').all(itemId);
        const logs = db.prepare('SELECT * FROM inventory_logs WHERE item_id = ? ORDER BY id DESC').all(itemId);

        return sendJson(res, 200, { item, photos, millJobs, logs });
      }

      // 4. QUICK STOCK ADJUSTMENT (+ / - PIECES)
      const adjustMatch = pathname.match(/^\/api\/items\/(\d+)\/adjust-stock$/);
      if (adjustMatch && method === 'POST') {
        const itemId = parseInt(adjustMatch[1]);
        const data = await parseJsonBody(req);
        const delta = parseInt(data.delta) || 0;
        const reason = data.reason || 'Manual adjustment';
        const notes = data.notes || '';
        const user = data.user || 'Erin / Jim Morgan';

        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        if (!item) return sendJson(res, 404, { error: 'Item not found' });

        const oldPcs = item.pieces || 0;
        const newPcs = Math.max(0, oldPcs + delta);

        let newBf = item.board_feet || 0;
        let newSqft = item.square_feet || 0;

        if (oldPcs > 0 && item.board_feet > 0) {
          newBf = Math.round((item.board_feet / oldPcs) * newPcs * 10) / 10;
        }
        if (oldPcs > 0 && item.square_feet > 0) {
          newSqft = Math.round((item.square_feet / oldPcs) * newPcs * 10) / 10;
        }

        let newStatus = item.status;
        if (newPcs === 0) {
          newStatus = 'Sold Out';
        } else if (newPcs > 0 && item.status === 'Sold Out') {
          newStatus = 'Available';
        }

        db.prepare(`
          UPDATE items SET 
            pieces = ?, 
            board_feet = ?, 
            square_feet = ?, 
            status = ?, 
            updated_at = datetime('now')
          WHERE id = ?
        `).run(newPcs, newBf, newSqft, newStatus, itemId);

        const logMsg = `Stock adjusted by ${delta > 0 ? '+' : ''}${delta} pcs (${oldPcs} -> ${newPcs}). Reason: ${reason}${notes ? ` - Notes: ${notes}` : ''}`;
        logAction(db, itemId, 'STOCK_ADJUSTMENT', logMsg, user);

        const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        return sendJson(res, 200, { success: true, item: updatedItem });
      }

      // 5. CREATE ITEM
      if (pathname === '/api/items' && method === 'POST') {
        const data = await parseJsonBody(req);
        
        // Auto-generate SKU if omitted (FM for wood bundles, OG for studio art/furniture)
        if (!data.sku) {
          const cat = data.category_code || 'GEN';
          const isWood = cat === 'TIM' || cat === 'FLR' || data.yard_location === 'Florez Workshop';
          const prefix = isWood ? 'FM' : 'OG';
          const count = db.prepare('SELECT COUNT(*) as cnt FROM items WHERE category_code = ?').get(cat).cnt + 1;
          data.sku = `${prefix}-${cat}-${String(count).padStart(2, '0')}`;
        }

        // Default location must be one of the two designated locations
        const validLocation = data.yard_location === 'Old World Studio' ? 'Old World Studio' : 'Florez Workshop';

        // Metric calculation
        const metrics = calculateMetrics(data, db);
        if (!data.board_feet) data.board_feet = metrics.board_feet;
        if (!data.weight_lbs) data.weight_lbs = metrics.weight_lbs;

        const stmt = db.prepare(`
          INSERT INTO items (
            sku, category_code, name, species_material, dimensions_display,
            thickness_in, width_in, length_ft, pieces, board_feet, square_feet,
            linear_feet, weight_lbs, description, provenance_origin, year_built,
            historical_notes, condition, processing_needs, acquisition_cost,
            price_per_unit, price_unit_type, target_price, target_buyer,
            yard_location, status, bundle_ref, lot_number, flag_notes,
            verified_by, verified_date, primary_photo, chairish_ready,
            marketplace_ready, website_featured
          ) VALUES (
            @sku, @category_code, @name, @species_material, @dimensions_display,
            @thickness_in, @width_in, @length_ft, @pieces, @board_feet, @square_feet,
            @linear_feet, @weight_lbs, @description, @provenance_origin, @year_built,
            @historical_notes, @condition, @processing_needs, @acquisition_cost,
            @price_per_unit, @price_unit_type, @target_price, @target_buyer,
            @yard_location, @status, @bundle_ref, @lot_number, @flag_notes,
            @verified_by, @verified_date, @primary_photo, @chairish_ready,
            @marketplace_ready, @website_featured
          )
        `);

        const insertData = {
          sku: data.sku,
          category_code: data.category_code || 'MISC',
          name: data.name || 'Untitled Inventory Item',
          species_material: data.species_material || 'Antique Material',
          dimensions_display: data.dimensions_display || '',
          thickness_in: parseFloat(data.thickness_in) || 0,
          width_in: parseFloat(data.width_in) || 0,
          length_ft: parseFloat(data.length_ft) || 0,
          pieces: parseInt(data.pieces) || 1,
          board_feet: parseFloat(data.board_feet) || 0,
          square_feet: parseFloat(data.square_feet) || 0,
          linear_feet: parseFloat(data.linear_feet) || 0,
          weight_lbs: parseFloat(data.weight_lbs) || 0,
          description: data.description || '',
          provenance_origin: data.provenance_origin || '',
          year_built: data.year_built || '',
          historical_notes: data.historical_notes || '',
          condition: data.condition || 'Sound / Reclaimed',
          processing_needs: data.processing_needs || '',
          acquisition_cost: parseFloat(data.acquisition_cost) || 0,
          price_per_unit: parseFloat(data.price_per_unit) || 0,
          price_unit_type: data.price_unit_type || 'BF',
          target_price: parseFloat(data.target_price) || 0,
          target_buyer: data.target_buyer || 'B2B / B2C',
          yard_location: validLocation,
          status: data.status || 'Available',
          bundle_ref: data.bundle_ref || '',
          lot_number: parseInt(data.lot_number) || null,
          flag_notes: data.flag_notes || '',
          verified_by: data.verified_by || 'Jim Morgan / Erin',
          verified_date: data.verified_date || new Date().toISOString().split('T')[0],
          primary_photo: data.primary_photo || '/assets/photos/beams.jpg',
          chairish_ready: data.chairish_ready ? 1 : 0,
          marketplace_ready: data.marketplace_ready ? 1 : 0,
          website_featured: data.website_featured ? 1 : 0
        };

        const result = stmt.run(insertData);
        logAction(db, result.lastInsertRowid, 'CREATE_ITEM', `Created item ${insertData.sku} (${insertData.name}) at ${insertData.yard_location}`);

        return sendJson(res, 201, { id: result.lastInsertRowid, ...insertData });
      }

      // 6. UPDATE ITEM
      if (itemMatch && method === 'PUT') {
        const itemId = parseInt(itemMatch[1]);
        const data = await parseJsonBody(req);
        
        // Recalculate BF if dimensions provided
        const metrics = calculateMetrics(data, db);
        if (data.thickness_in && data.width_in && data.length_ft) {
          data.board_feet = metrics.board_feet;
          data.weight_lbs = metrics.weight_lbs;
        }

        // Restrict location to Florez Workshop or Old World Studio if provided
        if (data.yard_location) {
          data.yard_location = data.yard_location === 'Old World Studio' ? 'Old World Studio' : 'Florez Workshop';
        }

        const stmt = db.prepare(`
          UPDATE items SET
            sku = COALESCE(@sku, sku),
            category_code = COALESCE(@category_code, category_code),
            name = COALESCE(@name, name),
            species_material = COALESCE(@species_material, species_material),
            dimensions_display = COALESCE(@dimensions_display, dimensions_display),
            thickness_in = COALESCE(@thickness_in, thickness_in),
            width_in = COALESCE(@width_in, width_in),
            length_ft = COALESCE(@length_ft, length_ft),
            pieces = COALESCE(@pieces, pieces),
            board_feet = COALESCE(@board_feet, board_feet),
            square_feet = COALESCE(@square_feet, square_feet),
            linear_feet = COALESCE(@linear_feet, linear_feet),
            weight_lbs = COALESCE(@weight_lbs, weight_lbs),
            description = COALESCE(@description, description),
            provenance_origin = COALESCE(@provenance_origin, provenance_origin),
            year_built = COALESCE(@year_built, year_built),
            historical_notes = COALESCE(@historical_notes, historical_notes),
            condition = COALESCE(@condition, condition),
            processing_needs = COALESCE(@processing_needs, processing_needs),
            acquisition_cost = COALESCE(@acquisition_cost, acquisition_cost),
            price_per_unit = COALESCE(@price_per_unit, price_per_unit),
            price_unit_type = COALESCE(@price_unit_type, price_unit_type),
            target_price = COALESCE(@target_price, target_price),
            target_buyer = COALESCE(@target_buyer, target_buyer),
            yard_location = COALESCE(@yard_location, yard_location),
            status = COALESCE(@status, status),
            flag_notes = COALESCE(@flag_notes, flag_notes),
            verified_by = COALESCE(@verified_by, verified_by),
            verified_date = COALESCE(@verified_date, verified_date),
            primary_photo = COALESCE(@primary_photo, primary_photo),
            chairish_ready = COALESCE(@chairish_ready, chairish_ready),
            marketplace_ready = COALESCE(@marketplace_ready, marketplace_ready),
            website_featured = COALESCE(@website_featured, website_featured),
            updated_at = datetime('now')
          WHERE id = @id
        `);

        stmt.run({ ...data, id: itemId });
        logAction(db, itemId, 'UPDATE_ITEM', `Updated item details for ID ${itemId}`);
        return sendJson(res, 200, { success: true, id: itemId });
      }

      // 7. DELETE ITEM
      if (itemMatch && method === 'DELETE') {
        const itemId = parseInt(itemMatch[1]);
        const item = db.prepare('SELECT sku, name FROM items WHERE id = ?').get(itemId);
        db.prepare('DELETE FROM items WHERE id = ?').run(itemId);
        logAction(db, null, 'DELETE_ITEM', `Deleted item ${item ? item.sku : itemId}`);
        return sendJson(res, 200, { success: true });
      }

      // 8. CATEGORIES & LOCATIONS
      if (pathname === '/api/categories' && method === 'GET') {
        const cats = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
        return sendJson(res, 200, cats);
      }

      if (pathname === '/api/species' && method === 'GET') {
        const species = db.prepare('SELECT * FROM species ORDER BY name ASC').all();
        return sendJson(res, 200, species);
      }

      if (pathname === '/api/locations' && method === 'GET') {
        const locs = db.prepare(`
          SELECT 
            l.code, l.name, l.type, l.description,
            COUNT(i.id) as item_count,
            COALESCE(SUM(i.board_feet), 0) as total_bf,
            COALESCE(SUM(i.square_feet), 0) as total_sqft,
            COALESCE(SUM(i.target_price), 0) as total_val
          FROM locations l
          LEFT JOIN items i ON i.yard_location = l.name
          GROUP BY l.code
          ORDER BY l.code ASC
        `).all();
        return sendJson(res, 200, locs);
      }

      // 9. MILL JOBS (FLOREZ MILLWORK TRACKING)
      if (pathname === '/api/mill-jobs' && method === 'GET') {
        const jobs = db.prepare(`
          SELECT 
            m.*, 
            i.sku as item_sku, 
            i.name as item_name, 
            i.species_material as item_species,
            i.dimensions_display as item_dimensions,
            i.board_feet as item_bf,
            i.square_feet as item_sqft
          FROM mill_jobs m
          JOIN items i ON m.item_id = i.id
          ORDER BY m.id DESC
        `).all();
        return sendJson(res, 200, jobs);
      }

      if (pathname === '/api/mill-jobs' && method === 'POST') {
        const data = await parseJsonBody(req);
        const count = db.prepare('SELECT COUNT(*) as cnt FROM mill_jobs').get().cnt + 1;
        const ticketNumber = data.ticket_number || `FLZ-2026-${String(count).padStart(3, '0')}`;

        const stmt = db.prepare(`
          INSERT INTO mill_jobs (
            ticket_number, item_id, service_type, miller, date_sent,
            estimated_completion, status, input_qty, output_yield, cost, notes
          ) VALUES (
            @ticket_number, @item_id, @service_type, @miller, @date_sent,
            @estimated_completion, @status, @input_qty, @output_yield, @cost, @notes
          )
        `);

        const insertData = {
          ticket_number: ticketNumber,
          item_id: parseInt(data.item_id),
          service_type: data.service_type || 'Custom Resaw & Milling',
          miller: data.miller || 'Rey Florez · Florez Millwork',
          date_sent: data.date_sent || new Date().toISOString().split('T')[0],
          estimated_completion: data.estimated_completion || '',
          status: data.status || 'In Progress',
          input_qty: parseFloat(data.input_qty) || 0,
          output_yield: data.output_yield || '',
          cost: parseFloat(data.cost) || 0,
          notes: data.notes || ''
        };

        const result = stmt.run(insertData);
        db.prepare("UPDATE items SET status = 'In Mill Processing' WHERE id = ?").run(insertData.item_id);

        logAction(db, insertData.item_id, 'CREATE_MILL_JOB', `Created Mill Work Order ${ticketNumber} with Rey Florez`);
        return sendJson(res, 201, { id: result.lastInsertRowid, ...insertData });
      }

      const millJobMatch = pathname.match(/^\/api\/mill-jobs\/(\d+)$/);
      if (millJobMatch && method === 'PUT') {
        const jobId = parseInt(millJobMatch[1]);
        const data = await parseJsonBody(req);

        const stmt = db.prepare(`
          UPDATE mill_jobs SET
            service_type = COALESCE(@service_type, service_type),
            miller = COALESCE(@miller, miller),
            estimated_completion = COALESCE(@estimated_completion, estimated_completion),
            completed_date = COALESCE(@completed_date, completed_date),
            status = COALESCE(@status, status),
            output_yield = COALESCE(@output_yield, output_yield),
            cost = COALESCE(@cost, cost),
            notes = COALESCE(@notes, notes),
            updated_at = datetime('now')
          WHERE id = @id
        `);

        stmt.run({ ...data, id: jobId });

        if (data.status === 'Completed' || data.status === 'Returned') {
          const job = db.prepare('SELECT item_id FROM mill_jobs WHERE id = ?').get(jobId);
          if (job && data.return_to_available) {
            db.prepare("UPDATE items SET status = 'Available' WHERE id = ?").run(job.item_id);
          }
        }

        return sendJson(res, 200, { success: true });
      }

      // 10. TIMBER & PRICING CALCULATOR
      if (pathname === '/api/calculate' && method === 'POST') {
        const data = await parseJsonBody(req);
        const t = parseFloat(data.thickness_in) || 0;
        const w = parseFloat(data.width_in) || 0;
        const l = parseFloat(data.length_ft) || 0;
        const pcs = parseInt(data.pieces) || 1;
        const pricePerUnit = parseFloat(data.price_per_unit) || 0;
        const speciesName = data.species || 'Heart Pine';

        const bf = Math.round(((t * w * l) / 12) * pcs * 100) / 100;
        const sqft = Math.round(((w * l) / 12) * pcs * 100) / 100;
        const linft = Math.round(l * pcs * 100) / 100;

        let density = 42;
        const sp = db.prepare('SELECT density_lbs_per_cuft FROM species WHERE name LIKE ? LIMIT 1')
                     .get(`%${speciesName.split(' ')[0]}%`);
        if (sp) density = sp.density_lbs_per_cuft;

        const weight = Math.round((bf / 12) * density);
        const weightPerPiece = pcs > 0 ? Math.round(weight / pcs) : weight;

        const totalPrice = Math.round(bf * pricePerUnit * 100) / 100;
        const wholesalePrice = Math.round(totalPrice * 0.70 * 100) / 100;

        return sendJson(res, 200, {
          thickness_in: t,
          width_in: w,
          length_ft: l,
          pieces: pcs,
          board_feet: bf,
          square_feet: sqft,
          linear_feet: linft,
          species: speciesName,
          density_lbs_per_cuft: density,
          estimated_weight_lbs: weight,
          weight_per_piece_lbs: weightPerPiece,
          price_per_bf: pricePerUnit,
          total_retail_price: totalPrice,
          total_wholesale_price: wholesalePrice
        });
      }

      // 11. OMNICHANNEL LISTING COPY GENERATOR
      const listingMatch = pathname.match(/^\/api\/listing\/(\d+)$/);
      if (listingMatch && method === 'GET') {
        const itemId = parseInt(listingMatch[1]);
        const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
        if (!item) return sendJson(res, 404, { error: 'Item not found' });

        const photos = db.prepare('SELECT url_path, caption FROM photos WHERE item_id = ?').all(itemId);

        const locationDisplay = item.yard_location === 'Florez Workshop'
          ? 'Florez Workshop & Mill (300 Race Ave Bldg 6, Waynesboro, VA 22980)'
          : 'Old World Studio & Showroom (Waynesboro / Charlottesville, VA)';

        const fbTitle = `${item.name} (${item.species_material || 'Antique Material'})`;
        const fbCopy = `
${item.name}
----------------------------------------
Price: $${item.target_price.toLocaleString()} | SKU: ${item.sku}
Condition: ${item.condition || 'Sound Authentic Condition'}
Material/Species: ${item.species_material}
Dimensions: ${item.dimensions_display || `${item.pieces} piece(s)`}
${item.board_feet > 0 ? `Total Volume: ${item.board_feet} Board Feet (BF)` : ''}
${item.square_feet > 0 ? `Available Coverage: ${item.square_feet} Sq Ft` : ''}
${item.weight_lbs > 0 ? `Estimated Weight: ~${item.weight_lbs} lbs` : ''}
Location: ${locationDisplay}

PROVENANCE & HISTORY:
${item.provenance_origin || 'Salvaged antique historic structure'}.
${item.historical_notes || 'Authentic slow-growth material with historic patina and density.'}

DETAILS & SPECIFICATIONS:
${item.description || 'Rare architectural inventory preserved and ready for custom installation or artisan fabrication.'}

PICKUP & FREIGHT:
- Forklift loading available on-site at Florez Workshop.
- Local Shenandoah Valley / Charlottesville delivery available.
- Regional LTL freight shipping arranged upon request.
- Inspected and verified by: ${item.verified_by || 'Jim Morgan'} (${item.verified_date || 'Fall 2026'}).

Contact Old Growth Reclaimed Woods to reserve or schedule viewing.
#ReclaimedWood #HeartPine #AntiqueFlooring #ArchitecturalSalvage #FlorezMillwork
        `.trim();

        const chairishData = {
          title: item.name,
          category: item.category_code === 'ART' ? 'Art' : (item.category_code === 'FUR' ? 'Furniture' : 'Architectural Salvage'),
          description: `${item.description} Provenance: ${item.provenance_origin}. Dimensions: ${item.dimensions_display}.`,
          styles: 'American Antique, Industrial, Rustic Farmhouse',
          materials: item.species_material || 'Antique Reclaimed Wood',
          condition: item.condition || 'Good Antique Condition',
          price: item.target_price,
          sku: item.sku,
          brand: 'Florez Millworks / Old World Studio',
          pickup_name: 'Florez Millworks',
          pickup_street_address: '300 Race Ave Bldg 6',
          pickup_city: 'Waynesboro',
          pickup_state: 'VA',
          pickup_postal_code: '22980'
        };

        return sendJson(res, 200, {
          item,
          photos,
          facebook_marketplace: {
            title: fbTitle,
            price: item.target_price,
            body: fbCopy
          },
          craigslist: {
            title: `${fbTitle} - $${item.target_price} (${item.yard_location})`,
            body: fbCopy
          },
          chairish: chairishData
        });
      }

      // 12. EXPORT CSV
      if (pathname === '/api/export/csv' && method === 'GET') {
        const items = db.prepare('SELECT * FROM items ORDER BY yard_location, category_code, id ASC').all();
        const headers = [
          'ID', 'SKU', 'Location', 'Category', 'Name', 'Species', 'Dimensions', 'Pieces', 
          'Board_Feet', 'Square_Feet', 'Weight_Lbs', 'Condition', 'Acquisition_Cost', 
          'Target_Price', 'Target_Buyer', 'Status', 'Provenance', 'Verified_By'
        ];

        let csv = headers.join(',') + '\n';
        for (const it of items) {
          const row = [
            it.id,
            `"${(it.sku || '').replace(/"/g, '""')}"`,
            `"${(it.yard_location || '').replace(/"/g, '""')}"`,
            `"${(it.category_code || '').replace(/"/g, '""')}"`,
            `"${(it.name || '').replace(/"/g, '""')}"`,
            `"${(it.species_material || '').replace(/"/g, '""')}"`,
            `"${(it.dimensions_display || '').replace(/"/g, '""')}"`,
            it.pieces,
            it.board_feet,
            it.square_feet,
            it.weight_lbs,
            `"${(it.condition || '').replace(/"/g, '""')}"`,
            it.acquisition_cost,
            it.target_price,
            `"${(it.target_buyer || '').replace(/"/g, '""')}"`,
            `"${(it.status || '').replace(/"/g, '""')}"`,
            `"${(it.provenance_origin || '').replace(/"/g, '""')}"`,
            `"${(it.verified_by || '').replace(/"/g, '""')}"`
          ];
          csv += row.join(',') + '\n';
        }

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="old_growth_reclaimed_inventory.csv"',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(csv);
      }

      // 13. EXPORT CHAIRISH READY CSV
      if (pathname === '/api/export/chairish' && method === 'GET') {
        const items = db.prepare('SELECT * FROM items WHERE chairish_ready = 1 OR category_code IN (\'ARC\', \'FUR\', \'ART\')').all();
        const headers = [
          'SKU', 'Title', 'Category', 'Description', 'Materials', 'Condition', 'Price', 'Dimensions', 'Pickup_Location'
        ];
        let csv = headers.join(',') + '\n';
        for (const it of items) {
          const row = [
            `"${(it.sku || '').replace(/"/g, '""')}"`,
            `"${(it.name || '').replace(/"/g, '""')}"`,
            `"${(it.category_code || '').replace(/"/g, '""')}"`,
            `"${(it.description || '').replace(/"/g, '""')}"`,
            `"${(it.species_material || '').replace(/"/g, '""')}"`,
            `"${(it.condition || '').replace(/"/g, '""')}"`,
            it.target_price,
            `"${(it.dimensions_display || '').replace(/"/g, '""')}"`,
            `"${(it.yard_location || 'Old World Studio')}"`
          ];
          csv += row.join(',') + '\n';
        }

        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="chairish_batch_catalog.csv"',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(csv);
      }

      // 14. TRIGGER BACKUP
      if (pathname === '/api/backup' && method === 'POST') {
        const backupFile = backupDatabase();
        if (backupFile) {
          logAction(db, null, 'DATABASE_BACKUP', `Database snapshot saved: ${path.basename(backupFile)}`);
          return sendJson(res, 200, { success: true, backupFile: path.basename(backupFile) });
        } else {
          return sendJson(res, 500, { error: 'Failed to create database backup' });
        }
      }

      // 15. AUDIT LOGS
      if (pathname === '/api/logs' && method === 'GET') {
        const logs = db.prepare('SELECT * FROM inventory_logs ORDER BY id DESC LIMIT 50').all();
        return sendJson(res, 200, logs);
      }

      return sendJson(res, 404, { error: 'API route not found' });
    } catch (apiErr) {
      console.error('API Error:', apiErr);
      return sendJson(res, 500, { error: apiErr.message });
    }
  }

  // -------------------------------------------------------------------------
  // STATIC FILE SERVING: public/
  // -------------------------------------------------------------------------
  let safePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('File not found');
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      if (method === 'HEAD') {
        return res.end();
      }
      res.end(content);
    } catch (e) {
      // Client connection aborted mid-transfer, ignore
    }
  });
});

// Server client connection error handling (e.g. malformed mobile HTTP requests or socket resets)
server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) {
    return;
  }
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// Global Process Resilience Protection
process.on('uncaughtException', (err) => {
  if (
    err.code === 'ECONNRESET' ||
    err.code === 'EPIPE' ||
    err.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    err.code === 'ERR_STREAM_DESTROYED'
  ) {
    // Normal client disconnection on mobile/remote networks
    return;
  }
  console.error('[UNCAUGHT EXCEPTION RECOVERED]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION RECOVERED]', reason);
});

// Bind to 0.0.0.0 for LAN access
server.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkIps();
  const tunnel = getTunnelInfo();
  console.log(`=======================================================`);
  console.log(` Old Growth Reclaimed Woods - Inventory Management System`);
  console.log(` Local:   http://localhost:${PORT}`);
  ips.forEach(net => {
    console.log(` Network: http://${net.address}:${PORT} (${net.name})`);
  });
  if (tunnel.url) {
    console.log(` Remote:  ${tunnel.url}`);
  }
  console.log(` Database: ${DB_PATH}`);
  console.log(` Locations: Florez Workshop | Old World Studio`);
  console.log(`=======================================================`);
});
