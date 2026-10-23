/**
 * Old Growth Reclaimed Woods - Inventory Management System
 * Client SPA Logic · Florez Workshop & Old World Studio
 */

let state = {
  items: [],
  filteredItems: [],
  categories: [],
  species: [],
  locations: [],
  stats: null,
  millJobs: [],
  logs: [],
  networkInfo: null,
  activeTab: 'catalog-tab',
  viewMode: 'table',
  selectedItemId: null,
  activeDetailItem: null,
  activeDetailPhotos: [],
  stockAdjustTargetItem: null,
  stockAdjustDirection: -1
};

// ==========================================================================
// Initialization
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  if (window.innerWidth < 768) {
    setViewMode('grid');
  }
  setupTabs();
  init();
});

async function init() {
  await Promise.all([
    loadStats(),
    loadCategories(),
    loadLocations(),
    loadItems(),
    loadMillJobs(),
    loadLogs(),
    loadNetworkInfo()
  ]);

  runCalculator();
  updateLocationHeroStats();
}

// ==========================================================================
// API Calls & Data Fetching
// ==========================================================================

async function loadNetworkInfo() {
  try {
    const res = await fetch('/api/network-info');
    if (!res.ok) return;
    state.networkInfo = await res.json();
    const shareInput = document.getElementById('share-network-url');
    if (shareInput && state.networkInfo.networkUrl) {
      shareInput.value = state.networkInfo.networkUrl;
    }
    const tunnelInput = document.getElementById('share-tunnel-url');
    const tunnelStatus = document.getElementById('share-tunnel-status');
    if (tunnelInput) {
      if (state.networkInfo.tunnelUrl) {
        tunnelInput.value = state.networkInfo.tunnelUrl;
        if (tunnelStatus) {
          tunnelStatus.textContent = '🟢 Self-healing Cloudflare live bridge active';
          tunnelStatus.style.color = '#38a169';
        }
      } else {
        tunnelInput.value = 'Connecting Cloudflare bridge...';
        if (tunnelStatus) {
          tunnelStatus.textContent = '🟡 Cloudflare bridge initializing in background...';
          tunnelStatus.style.color = '#c8a57c';
        }
      }
    }
  } catch (e) {
    console.error('Network info error:', e);
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to load stats');
    const data = await res.json();
    state.stats = data;
    renderStats(data);
  } catch (err) {
    console.error('Stats error:', err);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error('Failed to load categories');
    state.categories = await res.json();
    renderCategoryChips();
  } catch (err) {
    console.error('Categories error:', err);
  }
}

async function loadLocations() {
  try {
    const res = await fetch('/api/locations');
    if (!res.ok) throw new Error('Failed to load locations');
    state.locations = await res.json();
  } catch (err) {
    console.error('Locations error:', err);
  }
}

async function loadItems() {
  try {
    const res = await fetch('/api/items');
    if (!res.ok) throw new Error('Failed to load items');
    state.items = await res.json();
    state.filteredItems = [...state.items];
    renderInventory();
    populateListerDropdown();
    populateMillItemDropdown();
    updateLocationHeroStats();
  } catch (err) {
    console.error('Items error:', err);
  }
}

async function loadMillJobs() {
  try {
    const res = await fetch('/api/mill-jobs');
    if (!res.ok) throw new Error('Failed to load mill jobs');
    state.millJobs = await res.json();
    renderMillJobs();
  } catch (err) {
    console.error('Mill jobs error:', err);
  }
}

async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    if (!res.ok) throw new Error('Failed to load logs');
    state.logs = await res.json();
    renderLogs();
  } catch (err) {
    console.error('Logs error:', err);
  }
}

// ==========================================================================
// Rendering: KPI Metrics & Navigation
// ==========================================================================

function renderStats(data) {
  if (!data || !data.summary) return;
  const s = data.summary;

  document.getElementById('stat-valuation').innerText = '$' + (s.total_valuation || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('stat-pieces').innerText = `${s.total_items || 0} inventory lots (${s.total_pieces || 0} pcs)`;
  document.getElementById('stat-florez-count').innerText = `${s.florez_count || 0} lots`;
  document.getElementById('stat-studio-count').innerText = `${s.studio_count || 0} lots`;
  document.getElementById('stat-bf').innerText = (s.total_board_feet || 0).toLocaleString('en-US') + ' BF';
  document.getElementById('stat-sqft').innerText = `${(s.total_square_feet || 0).toLocaleString('en-US')} Sq Ft Flooring`;
  document.getElementById('stat-mill').innerText = (s.in_mill_items || 0) + ` (${data.activeMillJobs || 0} orders)`;
}

function updateLocationHeroStats() {
  const florezItems = state.items.filter(i => i.yard_location === 'Florez Workshop');
  const studioItems = state.items.filter(i => i.yard_location === 'Old World Studio');

  const florezBf = florezItems.reduce((sum, i) => sum + (i.board_feet || 0), 0);
  const florezVal = florezItems.reduce((sum, i) => sum + (i.target_price || 0), 0);

  const studioVal = studioItems.reduce((sum, i) => sum + (i.target_price || 0), 0);
  const studioChairish = studioItems.filter(i => i.chairish_ready === 1).length;

  const setSafe = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setSafe('florez-items-stat', florezItems.length);
  setSafe('florez-bf-stat', florezBf.toLocaleString() + ' BF');
  setSafe('florez-val-stat', '$' + florezVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  setSafe('studio-items-stat', studioItems.length);
  setSafe('studio-chairish-stat', studioChairish);
  setSafe('studio-val-stat', '$' + studioVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
      state.activeTab = tabId;

      if (tabId === 'locations-tab') {
        updateLocationHeroStats();
      }
    });
  });
}

// ==========================================================================
// Category Chips & Filtering
// ==========================================================================

function renderCategoryChips() {
  const container = document.getElementById('category-chips');
  if (!container) return;

  const totalCount = state.items.length;
  let html = `
    <button class="chip active" onclick="filterByCategory('ALL', this)">
      All Stock <span class="chip-count">${totalCount}</span>
    </button>
  `;

  state.categories.forEach(cat => {
    const count = state.items.filter(i => i.category_code === cat.code).length;
    html += `
      <button class="chip" onclick="filterByCategory('${cat.code}', this)">
        ${cat.name} <span class="chip-count">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

function filterByCategory(code, element) {
  document.querySelectorAll('.category-chips .chip').forEach(c => c.classList.remove('active'));
  if (element) element.classList.add('active');
  document.getElementById('filter-category').value = code;
  applyFilters();
}

function filterByLocationDirect(locationName) {
  // Switch to catalog tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  document.querySelector('[data-tab="catalog-tab"]').classList.add('active');
  document.getElementById('catalog-tab').classList.add('active');

  document.getElementById('filter-location').value = locationName;
  applyFilters();
  showToast(`Showing stock located at ${locationName}`);
}

function handleSearchInput() {
  applyFilters();
}

function applyFilters() {
  const search = document.getElementById('filter-search').value.toLowerCase().trim();
  const location = document.getElementById('filter-location').value;
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const sort = document.getElementById('filter-sort').value;

  state.filteredItems = state.items.filter(it => {
    if (search) {
      const matchText = [
        it.sku, it.name, it.species_material, it.dimensions_display,
        it.description, it.provenance_origin, it.yard_location
      ].filter(Boolean).join(' ').toLowerCase();

      if (!matchText.includes(search)) return false;
    }

    if (location !== 'ALL' && it.yard_location !== location) return false;
    if (category !== 'ALL' && it.category_code !== category) return false;
    if (status !== 'ALL' && it.status !== status) return false;

    return true;
  });

  state.filteredItems.sort((a, b) => {
    if (sort === 'price_desc') return (b.target_price || 0) - (a.target_price || 0);
    if (sort === 'price_asc') return (a.target_price || 0) - (b.target_price || 0);
    if (sort === 'bf_desc') return (b.board_feet || 0) - (a.board_feet || 0);
    if (sort === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sort === 'sku_asc') return (a.sku || '').localeCompare(b.sku || '');
    if (sort === 'lot_asc') {
      const lotA = a.lot_number != null ? a.lot_number : 9999;
      const lotB = b.lot_number != null ? b.lot_number : 9999;
      if (lotA !== lotB) return lotA - lotB;
      return (a.sku || '').localeCompare(b.sku || '');
    }
    if (sort === 'florez_first') {
      const locA = a.yard_location === 'Florez Workshop' ? 0 : 1;
      const locB = b.yard_location === 'Florez Workshop' ? 0 : 1;
      if (locA !== locB) return locA - locB;
      return a.id - b.id;
    }
    if (sort === 'studio_first') {
      const locA = a.yard_location === 'Old World Studio' ? 0 : 1;
      const locB = b.yard_location === 'Old World Studio' ? 0 : 1;
      if (locA !== locB) return locA - locB;
      return a.id - b.id;
    }
    // Default: Catalog order (Florez Timbers -> Florez Flooring -> Studio Items)
    const getOrderGroup = (it) => {
      if (it.yard_location === 'Florez Workshop' && it.category_code === 'TIM') return 1;
      if (it.yard_location === 'Florez Workshop') return 2;
      return 3;
    };
    const grpA = getOrderGroup(a);
    const grpB = getOrderGroup(b);
    if (grpA !== grpB) return grpA - grpB;
    if (a.lot_number != null && b.lot_number != null) return a.lot_number - b.lot_number;
    return a.id - b.id;
  });

  renderInventory();
}

function resetFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-location').value = 'ALL';
  document.getElementById('filter-category').value = 'ALL';
  document.getElementById('filter-status').value = 'ALL';
  document.getElementById('filter-sort').value = 'catalog';

  document.querySelectorAll('.category-chips .chip').forEach((c, idx) => {
    if (idx === 0) c.classList.add('active');
    else c.classList.remove('active');
  });

  applyFilters();
}

// ==========================================================================
// Rendering: Inventory (Table & Grid) with Stock Steppers
// ==========================================================================

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('view-table-btn').classList.toggle('active', mode === 'table');
  document.getElementById('view-grid-btn').classList.toggle('active', mode === 'grid');

  document.getElementById('inventory-table-container').style.display = mode === 'table' ? 'block' : 'none';
  document.getElementById('inventory-grid-container').style.display = mode === 'grid' ? 'grid' : 'none';
}

function renderInventory() {
  const countEl = document.getElementById('results-count');
  if (countEl) {
    countEl.innerText = `Showing ${state.filteredItems.length} of ${state.items.length} lots`;
  }

  renderTable();
  renderGrid();
}

function getStatusBadge(status) {
  let badgeClass = 'badge-available';
  if (status === 'In Mill Processing') badgeClass = 'badge-mill';
  else if (status === 'Reserved') badgeClass = 'badge-reserved';
  else if (status === 'Sold' || status === 'Sold Out') badgeClass = 'badge-sold';
  return `<span class="badge ${badgeClass}">${status || 'Available'}</span>`;
}

function getLocationBadge(loc) {
  if (loc === 'Florez Workshop') {
    return `<span class="badge-florez" onclick="event.stopPropagation(); filterByLocationDirect('Florez Workshop')">Florez Workshop</span>`;
  }
  return `<span class="badge-studio" onclick="event.stopPropagation(); filterByLocationDirect('Old World Studio')">Old World Studio</span>`;
}

function renderTable() {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  if (state.filteredItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px; color: var(--muted);">No inventory lots match the current filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.filteredItems.map(it => {
    const photo = it.primary_photo || '/assets/photos/beams.jpg';
    let volumeDisplay = '—';
    if (it.board_feet > 0) volumeDisplay = `${it.board_feet.toLocaleString()} BF`;
    else if (it.square_feet > 0) volumeDisplay = `${it.square_feet.toLocaleString()} Sq Ft`;

    const priceText = it.target_price > 0 ? `$${it.target_price.toLocaleString()}` : 'Inquire';

    return `
      <tr>
        <td>
          <img src="${photo}" class="row-thumb" alt="${it.name}" onclick="openItemDetail(${it.id})" onerror="this.onerror=null; this.src='/assets/photos/beams.jpg';">
        </td>
        <td>
          <span class="sku-tag" onclick="openItemDetail(${it.id})" style="cursor: pointer;">${it.sku}</span>
        </td>
        <td>
          <div class="item-name-cell" onclick="openItemDetail(${it.id})" style="cursor: pointer;">${it.name}</div>
          <div class="item-sub-desc">${(it.provenance_origin || it.description || '').slice(0, 48)}</div>
        </td>
        <td>
          ${getLocationBadge(it.yard_location)}
        </td>
        <td>
          <div><strong>${it.species_material || 'Antique Material'}</strong></div>
          <div class="item-sub-desc">${it.category_code}</div>
        </td>
        <td>
          <div>${it.dimensions_display || '—'}</div>
        </td>
        <td>
          <div class="stock-stepper-wrap">
            <button class="step-btn minus" onclick="event.stopPropagation(); openStockAdjustModal(${it.id}, -1)" title="Subtract / Log Sale">−</button>
            <span class="stock-count-display">${it.pieces}</span>
            <button class="step-btn" onclick="event.stopPropagation(); openStockAdjustModal(${it.id}, 1)" title="Add Stock">+</button>
          </div>
        </td>
        <td>
          <strong class="highlight-gold">${volumeDisplay}</strong>
        </td>
        <td>
          <strong class="text-lg highlight-gold">${priceText}</strong>
        </td>
        <td>
          ${getStatusBadge(it.status)}
        </td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-outline" style="color: var(--walnut); border-color: var(--border);" onclick="openItemDetail(${it.id})" title="View Details">👁️</button>
            <button class="btn btn-sm btn-outline" style="color: var(--walnut); border-color: var(--border);" onclick="openEditItemModal(${it.id})" title="Edit Item">✏️</button>
            <button class="btn btn-sm btn-outline" style="color: var(--walnut); border-color: var(--border);" onclick="openListerForItem(${it.id})" title="Generate Listing">📢</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderGrid() {
  const container = document.getElementById('inventory-grid-container');
  if (!container) return;

  if (state.filteredItems.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">No inventory lots found.</div>`;
    return;
  }

  container.innerHTML = state.filteredItems.map(it => {
    const photo = it.primary_photo || '/assets/photos/beams.jpg';
    let volumeDisplay = '';
    if (it.board_feet > 0) volumeDisplay = `${it.board_feet.toLocaleString()} BF`;
    else if (it.square_feet > 0) volumeDisplay = `${it.square_feet.toLocaleString()} Sq Ft`;

    const priceText = it.target_price > 0 ? `$${it.target_price.toLocaleString()}` : 'Inquire';

    return `
      <div class="grid-card" onclick="openItemDetail(${it.id})">
        <div class="grid-img-wrap">
          <img src="${photo}" class="grid-img" alt="${it.name}" loading="lazy" onerror="this.onerror=null; this.src='/assets/photos/beams.jpg';">
          <div class="grid-badge">${getStatusBadge(it.status)}</div>
        </div>
        <div class="grid-body">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span class="grid-sku">${it.sku}</span>
            ${getLocationBadge(it.yard_location)}
          </div>
          <h3 class="grid-title">${it.name}</h3>
          <div class="grid-details-row">
            <span>${it.species_material || 'Antique Material'}</span>
            <span class="highlight-gold">${volumeDisplay}</span>
          </div>
          <div class="grid-details-row">
            <span>${it.dimensions_display || ''}</span>
          </div>

          <!-- Grid Stock Stepper -->
          <div class="grid-stock-stepper" onclick="event.stopPropagation()">
            <span style="font-size: 0.78rem; color: var(--muted); font-weight: 600;">Stock:</span>
            <div class="stock-stepper-wrap">
              <button class="step-btn minus" onclick="openStockAdjustModal(${it.id}, -1)">−</button>
              <span class="stock-count-display">${it.pieces} pcs</span>
              <button class="step-btn" onclick="openStockAdjustModal(${it.id}, 1)">+</button>
            </div>
          </div>

          <div class="grid-price-row">
            <span class="grid-price">${priceText}</span>
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openItemDetail(${it.id})">Details →</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// Quick Stock Adjustment (+ / -) Logic
// ==========================================================================

function openStockAdjustModal(itemId, direction = -1) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  state.stockAdjustTargetItem = item;
  state.stockAdjustDirection = direction;

  document.getElementById('stock-item-id').value = item.id;
  document.getElementById('stock-direction').value = direction;
  document.getElementById('stock-modal-title').innerText = direction < 0 ? 'Deduct Stock / Log Sale' : 'Add Incoming Stock';
  document.getElementById('stock-modal-sku').innerText = `${item.sku} · ${item.name} (${item.yard_location})`;

  document.getElementById('stock-current-pcs').innerText = item.pieces;
  let footageText = '';
  if (item.board_feet > 0) footageText = `${item.board_feet} BF total`;
  else if (item.square_feet > 0) footageText = `${item.square_feet} Sq Ft total`;
  document.getElementById('stock-current-footage').innerText = footageText;

  document.getElementById('stock-amount-label').innerText = direction < 0 ? 'Number of Pieces to Subtract *' : 'Number of Pieces to Add *';
  document.getElementById('stock-delta-input').value = 1;
  document.getElementById('stock-delta-input').max = direction < 0 ? item.pieces : 9999;

  const reasonSelect = document.getElementById('stock-reason-select');
  if (direction < 0) {
    reasonSelect.innerHTML = `
      <option value="Sold to Client">Sold to Client</option>
      <option value="Dispatched to Mill (Rey Florez)">Dispatched to Mill (Rey Florez)</option>
      <option value="Used in Internal Project">Used in Internal Project</option>
      <option value="Damaged / Offcut">Damaged / Offcut</option>
      <option value="Inventory Recount">Inventory Recount</option>
    `;
  } else {
    reasonSelect.innerHTML = `
      <option value="Received New Stock Lot">Received New Stock Lot</option>
      <option value="Returned from Mill (Rey Florez)">Returned from Mill (Rey Florez)</option>
      <option value="Returned from Client / Cancelled">Returned from Client / Cancelled</option>
      <option value="Inventory Recount">Inventory Recount</option>
    `;
  }

  document.getElementById('stock-notes-input').value = '';
  document.getElementById('stock-submit-btn').innerText = direction < 0 ? 'Confirm Deduction' : 'Confirm Addition';

  calculateProjectedStock();
  openModal('stock-modal');
}

function openStockAdjustModalFromDetail(direction) {
  if (state.activeDetailItem) {
    closeModal('detail-modal');
    openStockAdjustModal(state.activeDetailItem.id, direction);
  }
}

function calculateProjectedStock() {
  const item = state.stockAdjustTargetItem;
  if (!item) return;

  const dir = state.stockAdjustDirection;
  const inputVal = parseInt(document.getElementById('stock-delta-input').value) || 0;
  const oldPcs = item.pieces || 0;
  const newPcs = Math.max(0, oldPcs + (dir * inputVal));

  document.getElementById('stock-projected-pcs').innerText = `${newPcs} piece${newPcs === 1 ? '' : 's'}`;

  let projFootage = '';
  if (oldPcs > 0 && item.board_feet > 0) {
    const newBf = Math.round((item.board_feet / oldPcs) * newPcs * 10) / 10;
    projFootage = `(~${newBf.toLocaleString()} BF)`;
  } else if (oldPcs > 0 && item.square_feet > 0) {
    const newSqft = Math.round((item.square_feet / oldPcs) * newPcs * 10) / 10;
    projFootage = `(~${newSqft.toLocaleString()} Sq Ft)`;
  }
  document.getElementById('stock-projected-footage').innerText = projFootage;
}

async function handleStockFormSubmit(e) {
  e.preventDefault();
  const itemId = document.getElementById('stock-item-id').value;
  const dir = parseInt(document.getElementById('stock-direction').value) || -1;
  const amount = parseInt(document.getElementById('stock-delta-input').value) || 0;
  const reason = document.getElementById('stock-reason-select').value;
  const notes = document.getElementById('stock-notes-input').value;

  const delta = dir * amount;

  try {
    const res = await fetch(`/api/items/${itemId}/adjust-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delta,
        reason,
        notes,
        user: 'Erin / Jim Morgan'
      })
    });

    if (!res.ok) throw new Error('Stock adjustment failed');
    const result = await res.json();

    closeModal('stock-modal');
    showToast(`Stock updated: ${delta > 0 ? '+' : ''}${delta} pieces (${reason})`);

    await Promise.all([loadItems(), loadStats(), loadLogs()]);
  } catch (err) {
    console.error('Error adjusting stock:', err);
    showToast('Failed to adjust stock. Check console.');
  }
}

// ==========================================================================
// Item Detail & Photo Gallery Modal
// ==========================================================================

async function openItemDetail(id) {
  try {
    const res = await fetch(`/api/items/${id}`);
    if (!res.ok) throw new Error('Item not found');
    const data = await res.json();
    state.activeDetailItem = data.item;
    state.activeDetailPhotos = data.photos || [];

    const it = data.item;
    document.getElementById('modal-item-category').innerText = it.category_name || it.category_code;
    document.getElementById('modal-item-location').innerText = it.yard_location;
    document.getElementById('modal-item-location').className = `badge ${it.yard_location === 'Florez Workshop' ? 'badge-florez' : 'badge-studio'}`;
    document.getElementById('modal-item-title').innerText = it.name;
    document.getElementById('modal-item-sku').innerText = `${it.sku} · Location: ${it.yard_location}`;

    // Specs
    document.getElementById('detail-loc').innerText = it.yard_location;
    document.getElementById('detail-dim').innerText = it.dimensions_display || 'Not specified';
    document.getElementById('detail-pcs').innerText = `${it.pieces} pieces in stock`;
    
    let volText = '—';
    if (it.board_feet > 0) volText = `${it.board_feet.toLocaleString()} BF`;
    else if (it.square_feet > 0) volText = `${it.square_feet.toLocaleString()} Sq Ft`;
    document.getElementById('detail-bf').innerText = volText;

    document.getElementById('detail-status').innerHTML = getStatusBadge(it.status);

    // Pricing
    document.getElementById('detail-price').innerText = it.target_price > 0 ? `$${it.target_price.toLocaleString()}` : '$0.00';
    document.getElementById('detail-unit-price').innerText = it.price_per_unit > 0 ? `$${it.price_per_unit} / ${it.price_unit_type || 'BF'}` : '—';

    // Provenance & Description
    document.getElementById('detail-provenance').innerText = it.provenance_origin || 'Authentic historical acquisition.';
    document.getElementById('detail-notes').innerText = it.historical_notes || '';
    document.getElementById('detail-desc').innerText = it.description || 'No detailed description recorded.';

    // Flags
    const flagEl = document.getElementById('detail-flag-alert');
    if (it.flag_notes) {
      flagEl.style.display = 'block';
      flagEl.innerHTML = `<strong>Note:</strong> ${it.flag_notes}`;
    } else {
      flagEl.style.display = 'none';
    }

    // Associated Mill Jobs
    const millSec = document.getElementById('detail-mill-section');
    const millList = document.getElementById('detail-mill-list');
    if (data.millJobs && data.millJobs.length > 0) {
      millSec.style.display = 'block';
      millList.innerHTML = data.millJobs.map(mj => `
        <div style="padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
          <span><strong>${mj.ticket_number}</strong> (${mj.service_type}) · Miller: ${mj.miller}</span>
          <span>Status: <strong>${mj.status}</strong> · Sent: ${mj.date_sent}</span>
        </div>
      `).join('');
    } else {
      millSec.style.display = 'none';
    }

    renderDetailPhotos(it, data.photos);
    openModal('detail-modal');
  } catch (err) {
    console.error('Error loading item detail:', err);
    showToast('Failed to load item detail');
  }
}

function renderDetailPhotos(item, photos) {
  const mainImg = document.getElementById('detail-main-img');
  const thumbsContainer = document.getElementById('detail-thumbnails');

  const allPhotoUrls = [];
  if (item.primary_photo) allPhotoUrls.push(item.primary_photo);
  if (photos && photos.length > 0) {
    photos.forEach(p => {
      if (!allPhotoUrls.includes(p.url_path)) allPhotoUrls.push(p.url_path);
    });
  }
  if (allPhotoUrls.length === 0) {
    allPhotoUrls.push('/assets/photos/beams.jpg');
  }

  mainImg.src = allPhotoUrls[0];
  mainImg.onerror = function() { this.onerror = null; this.src = '/assets/photos/beams.jpg'; };

  thumbsContainer.innerHTML = allPhotoUrls.map((url, idx) => `
    <button class="thumb-btn ${idx === 0 ? 'active' : ''}" onclick="switchDetailPhoto('${url}', this)">
      <img src="${url}" alt="Thumbnail" loading="lazy" onerror="this.onerror=null; this.src='/assets/photos/beams.jpg';">
    </button>
  `).join('');
}

function switchDetailPhoto(url, btn) {
  document.getElementById('detail-main-img').src = url;
  document.querySelectorAll('.thumb-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ==========================================================================
// Item Form: Add & Edit (Two Locations)
// ==========================================================================

function openNewItemModal() {
  document.getElementById('item-form').reset();
  document.getElementById('form-item-id').value = '';
  document.getElementById('item-form-title').innerText = 'Add New Stock Entry';
  document.getElementById('form-location').value = 'Florez Workshop';
  document.getElementById('form-photo').value = '/assets/photos/beams.jpg';
  openModal('item-form-modal');
}

function openEditItemModal(id) {
  const it = state.items.find(i => i.id === id);
  if (!it) return;

  document.getElementById('form-item-id').value = it.id;
  document.getElementById('item-form-title').innerText = `Edit Details: ${it.sku}`;
  document.getElementById('form-name').value = it.name || '';
  document.getElementById('form-location').value = it.yard_location || 'Florez Workshop';
  document.getElementById('form-category').value = it.category_code || 'TIM';
  document.getElementById('form-sku').value = it.sku || '';
  document.getElementById('form-species').value = it.species_material || '';
  document.getElementById('form-dim-display').value = it.dimensions_display || '';
  document.getElementById('form-thick').value = it.thickness_in || '';
  document.getElementById('form-width').value = it.width_in || '';
  document.getElementById('form-length').value = it.length_ft || '';
  document.getElementById('form-pieces').value = it.pieces || 1;
  document.getElementById('form-bf').value = it.board_feet || '';
  document.getElementById('form-sqft').value = it.square_feet || '';
  document.getElementById('form-target-price').value = it.target_price || '';
  document.getElementById('form-status').value = it.status || 'Available';
  document.getElementById('form-desc').value = it.description || '';
  document.getElementById('form-photo').value = it.primary_photo || '';
  document.getElementById('form-chairish').checked = it.chairish_ready === 1;
  document.getElementById('form-marketplace').checked = it.marketplace_ready === 1;

  openModal('item-form-modal');
}

function openEditItemModalFromDetail() {
  if (state.activeDetailItem) {
    closeModal('detail-modal');
    openEditItemModal(state.activeDetailItem.id);
  }
}

async function handleItemFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('form-item-id').value;
  const isEdit = Boolean(id);

  const payload = {
    name: document.getElementById('form-name').value,
    yard_location: document.getElementById('form-location').value,
    category_code: document.getElementById('form-category').value,
    sku: document.getElementById('form-sku').value,
    species_material: document.getElementById('form-species').value,
    dimensions_display: document.getElementById('form-dim-display').value,
    thickness_in: document.getElementById('form-thick').value,
    width_in: document.getElementById('form-width').value,
    length_ft: document.getElementById('form-length').value,
    pieces: document.getElementById('form-pieces').value,
    board_feet: document.getElementById('form-bf').value,
    square_feet: document.getElementById('form-sqft').value,
    target_price: document.getElementById('form-target-price').value,
    status: document.getElementById('form-status').value,
    description: document.getElementById('form-desc').value,
    primary_photo: document.getElementById('form-photo').value,
    chairish_ready: document.getElementById('form-chairish').checked ? 1 : 0,
    marketplace_ready: document.getElementById('form-marketplace').checked ? 1 : 0
  };

  try {
    const url = isEdit ? `/api/items/${id}` : '/api/items';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Failed to save item');

    closeModal('item-form-modal');
    showToast(isEdit ? 'Item updated successfully!' : 'New stock entry saved!');

    await Promise.all([loadItems(), loadStats(), loadLogs()]);
  } catch (err) {
    console.error('Error saving item:', err);
    showToast('Failed to save item. Check console.');
  }
}

// ==========================================================================
// Timber & Pricing Yard Calculator
// ==========================================================================

function runCalculator() {
  const speciesSelect = document.getElementById('calc-species');
  const speciesName = speciesSelect.value;
  const density = parseFloat(speciesSelect.options[speciesSelect.selectedIndex].getAttribute('data-density')) || 42;

  const t = parseFloat(document.getElementById('calc-thick').value) || 0;
  const w = parseFloat(document.getElementById('calc-width').value) || 0;
  const l = parseFloat(document.getElementById('calc-length').value) || 0;
  const pcs = parseInt(document.getElementById('calc-pieces').value) || 1;
  const pricePerUnit = parseFloat(document.getElementById('calc-price-unit').value) || 0;

  const bfTotal = Math.round(((t * w * l) / 12) * pcs * 10) / 10;
  const bfPiece = pcs > 0 ? Math.round((bfTotal / pcs) * 10) / 10 : 0;

  const totalWeight = Math.round((bfTotal / 12) * density);
  const weightPiece = pcs > 0 ? Math.round(totalWeight / pcs) : 0;

  const retailTotal = Math.round(bfTotal * pricePerUnit * 100) / 100;
  const wholesaleTotal = Math.round(retailTotal * 0.70 * 100) / 100;

  document.getElementById('res-bf').innerText = bfTotal.toLocaleString() + ' BF';
  document.getElementById('res-bf-piece').innerText = bfPiece.toLocaleString() + ' BF';
  document.getElementById('res-weight').innerText = `~${totalWeight.toLocaleString()} lbs`;
  document.getElementById('res-weight-piece').innerText = `~${weightPiece.toLocaleString()} lbs`;
  document.getElementById('res-retail').innerText = '$' + retailTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('res-wholesale').innerText = '$' + wholesaleTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function createLotFromCalculator() {
  const species = document.getElementById('calc-species').value;
  const location = document.getElementById('calc-location').value;
  const t = document.getElementById('calc-thick').value;
  const w = document.getElementById('calc-width').value;
  const l = document.getElementById('calc-length').value;
  const pcs = document.getElementById('calc-pieces').value;

  const bfText = document.getElementById('res-bf').innerText.replace(' BF', '').replace(/,/g, '');
  const retailText = document.getElementById('res-retail').innerText.replace('$', '').replace(/,/g, '');

  openNewItemModal();
  document.getElementById('form-name').value = `Reclaimed ${species} Stock (${t}x${w} x ${l}')`;
  document.getElementById('form-species').value = species;
  document.getElementById('form-location').value = location;
  document.getElementById('form-category').value = 'TIM';
  document.getElementById('form-thick').value = t;
  document.getElementById('form-width').value = w;
  document.getElementById('form-length').value = l;
  document.getElementById('form-pieces').value = pcs;
  document.getElementById('form-dim-display').value = `${t}x${w} x ${l}' (${pcs} pcs)`;
  document.getElementById('form-bf').value = bfText;
  document.getElementById('form-target-price').value = retailText;
}

function printTallyCard() {
  window.print();
}

// ==========================================================================
// Florez Millwork Tracking
// ==========================================================================

function populateMillItemDropdown() {
  const select = document.getElementById('mill-form-item');
  if (!select) return;

  const florezLots = state.items.filter(i => i.yard_location === 'Florez Workshop');
  select.innerHTML = florezLots.map(it => `
    <option value="${it.id}">
      ${it.sku} · ${it.name} (${it.board_feet > 0 ? it.board_feet + ' BF' : it.square_feet + ' Sq Ft'})
    </option>
  `).join('');
}

function openNewMillJobModal(preselectItemId) {
  document.getElementById('mill-form').reset();
  const dateInput = document.getElementById('mill-form-date');
  dateInput.value = new Date().toISOString().split('T')[0];

  if (preselectItemId) {
    document.getElementById('mill-form-item').value = preselectItemId;
  }
  openModal('mill-modal');
}

async function handleMillFormSubmit(e) {
  e.preventDefault();
  const payload = {
    item_id: document.getElementById('mill-form-item').value,
    miller: document.getElementById('mill-form-miller').value,
    service_type: document.getElementById('mill-form-service').value,
    date_sent: document.getElementById('mill-form-date').value,
    estimated_completion: document.getElementById('mill-form-est-date').value,
    input_qty: document.getElementById('mill-form-input-qty').value,
    cost: document.getElementById('mill-form-cost').value,
    notes: document.getElementById('mill-form-notes').value
  };

  try {
    const res = await fetch('/api/mill-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Failed to create mill job');

    closeModal('mill-modal');
    showToast('Milling order dispatched to Rey Florez!');

    await Promise.all([loadMillJobs(), loadItems(), loadStats(), loadLogs()]);
  } catch (err) {
    console.error('Error dispatching mill job:', err);
    showToast('Failed to create mill job');
  }
}

function renderMillJobs() {
  const container = document.getElementById('mill-jobs-container');
  if (!container) return;

  if (state.millJobs.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--muted);">No active mill orders dispatched.</div>`;
    return;
  }

  container.innerHTML = state.millJobs.map(job => {
    return `
      <div class="mill-card">
        <div class="mill-card-header">
          <div>
            <span class="ticket-num">${job.ticket_number}</span>
            <h3>${job.service_type}</h3>
          </div>
          <span class="badge ${job.status === 'Completed' ? 'badge-available' : 'badge-mill'}">${job.status}</span>
        </div>

        <div class="mill-details-list">
          <div class="mill-detail-row">
            <span class="lbl">Timber Lot:</span>
            <span><strong>${job.item_sku}</strong> · ${job.item_name}</span>
          </div>
          <div class="mill-detail-row">
            <span class="lbl">Miller & Facility:</span>
            <span>${job.miller}</span>
          </div>
          <div class="mill-detail-row">
            <span class="lbl">Date Sent:</span>
            <span>${job.date_sent || '—'}</span>
          </div>
          <div class="mill-detail-row">
            <span class="lbl">Est. Completion:</span>
            <span>${job.estimated_completion || 'Open'}</span>
          </div>
          <div class="mill-detail-row">
            <span class="lbl">Input Quantity:</span>
            <span>${job.input_qty ? job.input_qty + ' BF' : '—'}</span>
          </div>
          <div class="mill-detail-row">
            <span class="lbl">Expected Yield / Notes:</span>
            <span>${job.notes || '—'}</span>
          </div>
          <div class="mill-detail-row">
            <span class="lbl">Milling Cost:</span>
            <span class="highlight-gold font-bold">${job.cost > 0 ? '$' + job.cost.toFixed(2) : '$0.00'}</span>
          </div>
        </div>

        <div class="mill-actions">
          ${job.status !== 'Completed' ? `
            <button class="btn btn-sm btn-primary" onclick="markMillJobComplete(${job.id})">Mark Completed &amp; Return to Available</button>
          ` : `
            <span style="font-size: 0.8rem; color: var(--green); align-self: center;">✓ Completed &amp; Stocked</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function markMillJobComplete(jobId) {
  if (!confirm('Mark this milling work order complete and return lot to Available status at Florez Workshop?')) return;

  try {
    const res = await fetch(`/api/mill-jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Completed',
        completed_date: new Date().toISOString().split('T')[0],
        return_to_available: true
      })
    });

    if (!res.ok) throw new Error('Failed to update job');
    showToast('Mill job marked complete! Lot returned to available stock.');
    await Promise.all([loadMillJobs(), loadItems(), loadStats(), loadLogs()]);
  } catch (err) {
    console.error('Error completing job:', err);
    showToast('Failed to update job');
  }
}

// ==========================================================================
// Omnichannel Lister
// ==========================================================================

function populateListerDropdown() {
  const select = document.getElementById('lister-item-select');
  if (!select) return;

  select.innerHTML = state.items.map(it => `
    <option value="${it.id}">
      [${it.yard_location === 'Florez Workshop' ? 'FLOREZ' : 'STUDIO'}] ${it.sku} · ${it.name} ($${(it.target_price || 0).toLocaleString()})
    </option>
  `).join('');

  if (state.items.length > 0) {
    loadListingCopy(state.items[0].id);
  }
}

function openListerForItem(itemId) {
  closeModal('detail-modal');

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  document.querySelector('[data-tab="listing-tab"]').classList.add('active');
  document.getElementById('listing-tab').classList.add('active');

  const select = document.getElementById('lister-item-select');
  if (select) {
    select.value = itemId || state.items[0].id;
    loadListingCopy(select.value);
  }
}

async function loadListingCopy(itemId) {
  if (!itemId) return;
  try {
    const res = await fetch(`/api/listing/${itemId}`);
    if (!res.ok) throw new Error('Failed to load listing copy');
    const data = await res.json();

    const it = data.item;
    document.getElementById('lister-item-card').innerHTML = `
      <img src="${it.primary_photo || 'assets/photos/beams.jpg'}" style="width: 100%; height: 140px; object-fit: cover; border-radius: 3px; margin-bottom: 8px;" onerror="this.src='assets/photos/beams.jpg'">
      <h4>${it.name}</h4>
      <div style="font-size: 0.78rem; color: var(--muted); margin: 4px 0;">SKU: ${it.sku} · Location: ${it.yard_location}</div>
      <div class="highlight-gold" style="font-weight: 700; font-size: 1.1rem;">$${it.target_price.toLocaleString()}</div>
      <div style="font-size: 0.8rem; margin-top: 6px;">${it.dimensions_display || ''}</div>
    `;

    document.getElementById('fb-copy-area').value = data.facebook_marketplace.body;
    document.getElementById('cl-copy-area').value = data.craigslist.body;
    document.getElementById('chairish-copy-area').value = JSON.stringify(data.chairish, null, 2);
  } catch (err) {
    console.error('Error loading listing copy:', err);
  }
}

function switchPlatform(platform) {
  document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.platform-pane').forEach(p => p.classList.remove('active'));

  event.target.classList.add('active');
  document.getElementById(`pane-${platform}`).classList.add('active');
}

function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.select();
  navigator.clipboard.writeText(el.value).then(() => {
    showToast('Listing copy copied to clipboard!');
  }).catch(() => {
    document.execCommand('copy');
    showToast('Copied to clipboard!');
  });
}

// ==========================================================================
// Internal LAN Sharing
// ==========================================================================

function openShareModal() {
  openModal('share-modal');
}

function copyShareUrl() {
  const input = document.getElementById('share-network-url');
  if (!input) return;
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Internal Wi-Fi Link copied to clipboard!');
  }).catch(() => {
    document.execCommand('copy');
    showToast('Link copied!');
  });
}

function copyTunnelUrl() {
  const input = document.getElementById('share-tunnel-url');
  if (!input || !input.value || input.value.startsWith('Connecting')) {
    showToast('Mobile Bridge URL is still connecting. Please wait a moment...');
    return;
  }
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Mobile Remote Bridge link copied to clipboard!');
  }).catch(() => {
    document.execCommand('copy');
    showToast('Link copied!');
  });
}

// ==========================================================================
// Logs & Audit Trail
// ==========================================================================

function renderLogs() {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  if (state.logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--muted);">No logs recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.logs.map(l => `
    <tr>
      <td>#${l.id}</td>
      <td style="font-family: monospace; font-size: 0.8rem;">${l.created_at || '—'}</td>
      <td><strong>${l.user_name || 'System'}</strong></td>
      <td><span class="sku-tag">${l.action}</span></td>
      <td>${l.details || '—'}</td>
    </tr>
  `).join('');
}

// ==========================================================================
// Database Snapshots & CSV Exports
// ==========================================================================

async function triggerDbBackup() {
  try {
    const res = await fetch('/api/backup', { method: 'POST' });
    if (!res.ok) throw new Error('Backup failed');
    const data = await res.json();
    showToast(`Snapshot created: ${data.backupFile}`);
    await loadLogs();
  } catch (err) {
    console.error('Backup error:', err);
    showToast('Failed to generate snapshot');
  }
}

function exportStandardCsv() {
  window.open('/api/export/csv', '_blank');
  showToast('Downloading inventory CSV...');
}

function exportChairishCsv() {
  window.open('/api/export/chairish', '_blank');
  showToast('Downloading Chairish batch CSV...');
}

// ==========================================================================
// UI Helpers & Modals
// ==========================================================================

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function closeModalOnOverlay(e, id) {
  if (e.target.id === id) {
    closeModal(id);
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
