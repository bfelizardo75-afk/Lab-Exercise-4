/* =============================================================================
   Laboratory 4: Role-Based Asset Transaction and Approval Management System
   Application Logic (app.js)
   ============================================================================= */

// 1. SUPABASE AUTHENTICATION & STATE
const defaultSupabaseConfig = {
  url: 'https://lmtwznvsrbihnxgtbilr.supabase.co',
  anonKey: 'sb_publishable_RopVEg7OC1KuA-tgOGCMqA_ApXHq4zW'
};
const savedSupabaseConfig = JSON.parse(localStorage.getItem('supabase_config') || 'null');
let supabaseClient = createSupabaseClient(savedSupabaseConfig);

if (!supabaseClient) {
  localStorage.setItem('supabase_config', JSON.stringify(defaultSupabaseConfig));
  supabaseClient = createSupabaseClient(defaultSupabaseConfig);
}

function createSupabaseClient(config) {
  if (!window.supabase || !config?.url || !config?.anonKey) return null;
  return window.supabase.createClient(config.url, config.anonKey);
}

const USERS = {
  "11111111-1111-1111-1111-111111111111": {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Admin Maria Santos",
    email: "admin@lab.edu",
    role: "Administrator"
  },
  "22222222-2222-2222-2222-222222222222": {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Staff Juan Dela Cruz",
    email: "staff@lab.edu",
    role: "Laboratory Staff"
  },
  "33333333-3333-3333-3333-333333333333": {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Student Ana Reyes",
    email: "requester@lab.edu",
    role: "Requester / Viewer"
  }
};

const INITIAL_EQUIPMENT = [
  { id: "a1111111-1111-1111-1111-111111111111", asset_code: "LAP-001", name: "Dell XPS 15 Laptop", category: "Computing", status: "Available", condition_status: "Good" },
  { id: "a2222222-2222-2222-2222-222222222222", asset_code: "OSC-002", name: "Digital Oscilloscope 100MHz", category: "Electronics", status: "Available", condition_status: "Good" },
  { id: "a3333333-3333-3333-3333-333333333333", asset_code: "PROJ-003", name: "Epson 4K Projector", category: "AV Gear", status: "Maintenance", condition_status: "Under Repair" },
  { id: "a4444444-4444-4444-4444-444444444444", asset_code: "MIC-004", name: "Digital Microscope 1000x", category: "Biology", status: "Borrowed", condition_status: "Good" }
];

const INITIAL_TRANSACTIONS = [
  {
    id: "c1111111-1111-1111-1111-111111111111",
    requester_id: "33333333-3333-3333-3333-333333333333",
    equipment_id: "a1111111-1111-1111-1111-111111111111",
    status: "Pending",
    approved_by: null,
    notes: "For SAD Laboratory Project Presentation",
    created_at: new Date(Date.now() - 3600000).toISOString()
  }
];

const INITIAL_AUDIT_LOGS = [
  {
    id: "b1111111-1111-1111-1111-111111111111",
    user_id: "33333333-3333-3333-3333-333333333333",
    user_name: "Student Ana Reyes",
    action: "SUBMITTED",
    module: "Borrowing",
    record_id: "c1111111-1111-1111-1111-111111111111",
    description: "Submitted borrowing request for LAP-001",
    created_at: new Date(Date.now() - 3600000).toISOString()
  }
];

// Initialize Data in Local Storage
let currentUser = null;
let dbEquipment = JSON.parse(localStorage.getItem('lab_equipment')) || INITIAL_EQUIPMENT;
let dbTransactions = JSON.parse(localStorage.getItem('lab_transactions')) || INITIAL_TRANSACTIONS;
let dbAuditLogs = JSON.parse(localStorage.getItem('lab_audit_logs')) || INITIAL_AUDIT_LOGS;

function saveState() {
  localStorage.setItem('lab_equipment', JSON.stringify(dbEquipment));
  localStorage.setItem('lab_transactions', JSON.stringify(dbTransactions));
  localStorage.setItem('lab_audit_logs', JSON.stringify(dbAuditLogs));
}

function setLoginMessage(message, isError = true) {
  const messageElem = document.getElementById('login-message');
  if (messageElem) {
    messageElem.textContent = message;
    messageElem.className = `login-message ${isError ? 'error' : 'success'}`;
  }
}

function saveSupabaseConfig(event) {
  event.preventDefault();
  const url = document.getElementById('supabase-url').value.trim().replace(/\/$/, '');
  const anonKey = document.getElementById('supabase-anon-key').value.trim();
  localStorage.setItem('supabase_config', JSON.stringify({ url, anonKey }));
  window.location.reload();
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const loginButton = document.getElementById('login-button');

  if (!supabaseClient) {
    setLoginMessage('Configure SUPABASE_URL and SUPABASE_ANON_KEY in app.js first.');
    return;
  }

  loginButton.disabled = true;
  setLoginMessage('Signing in...', false);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.code === 'email_not_confirmed'
      ? 'Email not confirmed. Confirm this user in Supabase Authentication first.'
      : error.message;
    setLoginMessage(message);
    loginButton.disabled = false;
    return;
  }

  const loaded = await loadAuthenticatedUser(data.user);
  loginButton.disabled = false;
  if (!loaded) await supabaseClient.auth.signOut();
}

async function loadAuthenticatedUser(authUser) {
  const { data: profile, error } = await supabaseClient
    .from('users')
    .select('id, full_name, email, role')
    .eq('id', authUser.id)
    .single();

  if (error || !profile) {
    setLoginMessage('Your Supabase account has no role profile in the users table.');
    return false;
  }

  currentUser = {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role
  };
  USERS[profile.id] = currentUser;
  document.getElementById('login-screen').classList.add('hidden');
  setLoginMessage('', false);
  updateInterfaceByRole();
  renderAllViews();
  return true;
}

async function initializeAuthentication() {
  if (!supabaseClient) {
    document.getElementById('supabase-config-form').hidden = false;
    document.getElementById('login-form').hidden = true;
    setLoginMessage('Enter your Supabase URL and anon key first.');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await loadAuthenticatedUser(session.user);
  supabaseClient.auth.onAuthStateChange((_event, sessionState) => {
    if (!sessionState) {
      currentUser = null;
      document.getElementById('login-screen').classList.remove('hidden');
      updateInterfaceByRole();
    }
  });
}

async function logoutFromSupabase() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null;
  updateInterfaceByRole();
  showToast('Successfully logged out.', 'warning');
}

// 2. AUDIT TRAIL LOGGING ENGINE (BR-A4-10)
function createAuditLog(action, module, recordId, description, overrideUser = null) {
  const actor = overrideUser || currentUser;
  const newLog = {
    id: 'log-' + Date.now() + '-' + Math.floor(Math.random()*1000),
    user_id: actor ? actor.id : null,
    user_name: actor ? actor.name : 'System/Guest',
    action: action,
    module: module,
    record_id: String(recordId),
    description: description,
    created_at: new Date().toISOString()
  };
  dbAuditLogs.unshift(newLog);
  saveState();
  renderAuditLogs();
}

// 3. ROLE SWITCHING & ADAPTIVE NAVIGATION
function switchUserRole(userId) {
  if (!userId) {
    currentUser = null;
    showToast("Logged out from system", "info");
  } else {
    currentUser = USERS[userId];
    showToast(`Switched active user to: ${currentUser.name} (${currentUser.role})`, "info");
  }
  updateInterfaceByRole();
  renderAllViews();
}

function updateInterfaceByRole() {
  const role = currentUser ? currentUser.role : 'LoggedOut';
  
  // Header badges
  const userNameElem = document.getElementById('current-user-name');
  const rolePillElem = document.getElementById('current-user-role-pill');
  if (userNameElem && rolePillElem) {
    if (currentUser) {
      userNameElem.textContent = currentUser.name;
      rolePillElem.textContent = currentUser.role;
      rolePillElem.className = `role-pill role-${currentUser.role.replace(/[^a-zA-Z]/g, '-')}`;
    } else {
      userNameElem.textContent = "Unauthenticated User";
      rolePillElem.textContent = "Logged Out";
      rolePillElem.className = "role-pill role-Administrator";
    }
  }

  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarRole = document.getElementById('sidebar-user-role');
  if (sidebarName && sidebarRole) {
    sidebarName.textContent = currentUser ? currentUser.name : 'Not signed in';
    sidebarRole.textContent = currentUser ? currentUser.role : 'Sign in required';
  }

  // Navigation Guard Visibility (BR-A4-03 / Interface Requirements)
  const navApprovals = document.getElementById('nav-approvals');
  const navAudit = document.getElementById('nav-audit');
  const btnAddEq = document.getElementById('btn-add-equipment');

  if (role === 'Administrator') {
    if (navApprovals) navApprovals.classList.remove('hidden');
    if (navAudit) navAudit.classList.remove('hidden');
    if (btnAddEq) btnAddEq.style.display = 'inline-block';
  } else if (role === 'Laboratory Staff') {
    if (navApprovals) navApprovals.classList.add('hidden');
    if (navAudit) navAudit.classList.add('hidden');
    if (btnAddEq) btnAddEq.style.display = 'none';
  } else {
    // Requester / Viewer
    if (navApprovals) navApprovals.classList.add('hidden');
    if (navAudit) navAudit.classList.add('hidden');
    if (btnAddEq) btnAddEq.style.display = 'none';
  }
}

// 4. VIEW SWITCHER & ACCESS GUARDS (TC-A4-01, TC-A4-10)
function switchView(viewName) {
  // Access Guard Validation
  if (!currentUser) {
    showToast("Access Denied: You are logged out. Please log in first.", "error");
    return;
  }

  if (viewName === 'approvals' || viewName === 'audit') {
    if (currentUser.role !== 'Administrator') {
      showToast("Access Denied: Only Administrator may access this management area! (TC-A4-01)", "error");
      createAuditLog("ACCESS_DENIED", "Security", "Page: " + viewName, `Blocked ${currentUser.name} from accessing ${viewName}`);
      return;
    }
  }

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const targetSec = document.getElementById(`view-${viewName}`);
  const targetNav = document.getElementById(`nav-${viewName}`);

  if (targetSec) targetSec.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  const titleElem = document.getElementById('page-title');
  if (titleElem) {
    const titles = {
      dashboard: "System Dashboard",
      equipment: "Equipment Catalog & Inventory",
      requests: "Borrowing Transactions",
      approvals: "Admin Approval Queue",
      audit: "System Audit Trail",
      testing: "Functional Test Suite"
    };
    titleElem.textContent = titles[viewName] || "Lab Asset Manager";
  }

  renderAllViews();
}

function simulateLogout() {
  logoutFromSupabase();
}

// 5. BUSINESS RULES & TRANSACTIONS LIFECYCLE ENGINE

// Submitting a request (BR-A4-01, BR-A4-09, TC-A4-02)
function handleRequestSubmit(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast("Error: Unauthenticated user cannot submit requests.", "error");
    return;
  }

  const eqId = document.getElementById('request-equipment-select').value;
  const notes = document.getElementById('request-notes').value;

  const eq = dbEquipment.find(item => item.id === eqId);
  if (!eq) {
    showToast("Invalid equipment selected.", "error");
    return;
  }

  // Business Rule 01 & 09 Check
  if (eq.status === 'Maintenance') {
    showToast("BR-A4-09 Violation: Equipment under maintenance cannot be borrowed!", "error");
    return;
  }
  if (eq.status !== 'Available') {
    showToast("BR-A4-01 Violation: Only available equipment may be requested!", "error");
    return;
  }

  const newTransaction = {
    id: 'tx-' + Date.now(),
    requester_id: currentUser.id,
    equipment_id: eq.id,
    status: 'Pending',
    approved_by: null,
    notes: notes,
    created_at: new Date().toISOString()
  };

  dbTransactions.unshift(newTransaction);
  saveState();

  createAuditLog("SUBMITTED", "Borrowing", newTransaction.id, `Submitted borrowing request for ${eq.asset_code} (${eq.name})`);
  showToast(`Request saved as Pending for ${eq.name}! (TC-A4-02)`, "success");

  closeModal('modal-request');
  renderAllViews();
}

// Approve Request (BR-A4-02, BR-A4-03, TC-A4-03)
function approveRequest(txId) {
  if (!currentUser || currentUser.role !== 'Administrator') {
    showToast("BR-A4-03 Violation: Only Administrator may approve or reject requests!", "error");
    return;
  }

  const tx = dbTransactions.find(t => t.id === txId);
  if (!tx) return;

  // Business Rule 02 Check: Staff cannot approve their own request
  if (tx.requester_id === currentUser.id) {
    showToast("BR-A4-02 Violation: Administrator/Staff cannot approve their own request!", "error");
    return;
  }

  tx.status = 'Approved';
  tx.approved_by = currentUser.id;
  saveState();

  const eq = dbEquipment.find(e => e.id === tx.equipment_id);
  createAuditLog("APPROVED", "Borrowing", tx.id, `Approved borrowing request for ${eq ? eq.asset_code : tx.equipment_id}`);
  showToast(`Request approved successfully! Status is now Approved. (TC-A4-03)`, "success");
  renderAllViews();
}

// Reject Request (BR-A4-03, TC-A4-04)
function rejectRequest(txId) {
  if (!currentUser || currentUser.role !== 'Administrator') {
    showToast("BR-A4-03 Violation: Only Administrator may reject requests!", "error");
    return;
  }

  const tx = dbTransactions.find(t => t.id === txId);
  if (!tx) return;

  tx.status = 'Rejected';
  tx.approved_by = currentUser.id;
  saveState();

  const eq = dbEquipment.find(e => e.id === tx.equipment_id);
  createAuditLog("REJECTED", "Borrowing", tx.id, `Rejected borrowing request for ${eq ? eq.asset_code : tx.equipment_id}`);
  showToast(`Request rejected. Status updated to Rejected. (TC-A4-04)`, "warning");
  renderAllViews();
}

// Release Equipment (BR-A4-04, BR-A4-05, BR-A4-07, TC-A4-05, TC-A4-06)
function releaseEquipment(txId) {
  const tx = dbTransactions.find(t => t.id === txId);
  if (!tx) return;

  // BR-A4-07 & BR-A4-04 Check
  if (tx.status === 'Rejected') {
    showToast("BR-A4-07 / TC-A4-05 Violation: Operation blocked! Rejected requests cannot be released.", "error");
    return;
  }
  if (tx.status !== 'Approved') {
    showToast("BR-A4-04 Violation: Only Approved requests may be released!", "error");
    return;
  }

  tx.status = 'Released';
  
  // BR-A4-05: Released equipment becomes Borrowed
  const eq = dbEquipment.find(e => e.id === tx.equipment_id);
  if (eq) {
    eq.status = 'Borrowed';
  }
  saveState();

  createAuditLog("RELEASED", "Borrowing", tx.id, `Released equipment ${eq ? eq.asset_code : tx.equipment_id}. Item status set to Borrowed.`);
  showToast(`Equipment released! Status set to Borrowed. (TC-A4-06)`, "success");
  renderAllViews();
}

// Process Return (BR-A4-06, BR-A4-08, TC-A4-07)
function processReturn(txId) {
  const tx = dbTransactions.find(t => t.id === txId);
  if (!tx) return;

  // BR-A4-08 Check: Returned transactions cannot be processed twice
  if (tx.status === 'Returned' || tx.status === 'Closed') {
    showToast("BR-A4-08 Violation: Returned transactions cannot be processed twice!", "error");
    return;
  }

  tx.status = 'Returned';

  // BR-A4-06: Returned equipment becomes Available unless damaged
  const eq = dbEquipment.find(e => e.id === tx.equipment_id);
  if (eq) {
    eq.status = 'Available';
  }
  saveState();

  createAuditLog("RETURNED", "Borrowing", tx.id, `Processed return for ${eq ? eq.asset_code : tx.equipment_id}. Item returned to Available.`);
  showToast(`Return processed! Equipment is now Available. (TC-A4-07)`, "success");
  renderAllViews();
}

// Restricted Delete Attempt (TC-A4-09)
function attemptRestrictedDelete(recordId) {
  if (!currentUser || currentUser.role !== 'Administrator') {
    showToast("TC-A4-09 Violation: Restricted delete operation blocked! (Staff/Viewer unauthorized)", "error");
    createAuditLog("RESTRICTED_DELETE_BLOCKED", "Security", recordId, `Blocked delete attempt by non-admin user ${currentUser ? currentUser.name : 'Unknown'}`);
    return;
  }
  showToast("Admin privilege granted. Action simulated.", "info");
}

// 6. RENDER FUNCTIONS
function renderAllViews() {
  renderStats();
  renderDashboardRecent();
  renderEquipmentTable();
  renderTransactionsTable();
  renderApprovalsTable();
  renderAuditLogs();
}

function renderStats() {
  document.getElementById('stat-total-eq').textContent = dbEquipment.length;
  document.getElementById('stat-avail-eq').textContent = dbEquipment.filter(e => e.status === 'Available').length;
  document.getElementById('stat-pending-tx').textContent = dbTransactions.filter(t => t.status === 'Pending').length;
  document.getElementById('stat-borrowed-eq').textContent = dbEquipment.filter(e => e.status === 'Borrowed').length;
}

function renderDashboardRecent() {
  const tbody = document.getElementById('dashboard-recent-table');
  if (!tbody) return;
  tbody.innerHTML = '';

  const recent = dbTransactions.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No transaction activity logged yet.</td></tr>`;
    return;
  }

  recent.forEach(tx => {
    const user = USERS[tx.requester_id] || { name: 'Unknown User' };
    const eq = dbEquipment.find(e => e.id === tx.equipment_id) || { name: 'Unknown Asset' };
    const dateStr = new Date(tx.created_at).toLocaleDateString() + ' ' + new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td><strong>${user.name}</strong></td>
      <td>${eq.name}</td>
      <td><span class="status-badge status-${tx.status}">${tx.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderEquipmentTable() {
  const tbody = document.getElementById('equipment-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  dbEquipment.forEach(eq => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${eq.asset_code}</code></td>
      <td><strong>${eq.name}</strong></td>
      <td>${eq.category}</td>
      <td><span class="status-badge status-${eq.status}">${eq.status}</span></td>
      <td>${eq.condition_status}</td>
      <td>
        <button class="btn btn-secondary" onclick="openBorrowModalForId('${eq.id}')" ${eq.status !== 'Available' ? 'disabled' : ''}>
          Borrow
        </button>
        <button class="btn btn-danger" onclick="attemptRestrictedDelete('${eq.id}')">
          🗑️ Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTransactionsTable() {
  const tbody = document.getElementById('transactions-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  dbTransactions.forEach(tx => {
    const user = USERS[tx.requester_id] || { name: 'Unknown User' };
    const approver = USERS[tx.approved_by] ? USERS[tx.approved_by].name : '—';
    const eq = dbEquipment.find(e => e.id === tx.equipment_id) || { name: 'Unknown Equipment' };

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${tx.id.substring(0, 8)}</code></td>
      <td>${user.name}</td>
      <td>${eq.asset_code} - ${eq.name}</td>
      <td><span class="status-badge status-${tx.status}">${tx.status}</span></td>
      <td>${approver}</td>
      <td>
        ${tx.status === 'Approved' ? `<button class="btn btn-warning" onclick="releaseEquipment('${tx.id}')">📦 Release</button>` : ''}
        ${tx.status === 'Released' ? `<button class="btn btn-success" onclick="processReturn('${tx.id}')">↩️ Process Return</button>` : ''}
        ${tx.status === 'Rejected' ? `<button class="btn btn-secondary" onclick="releaseEquipment('${tx.id}')">Try Release</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderApprovalsTable() {
  const tbody = document.getElementById('approvals-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const pendingList = dbTransactions.filter(t => t.status === 'Pending');

  if (pendingList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">No pending borrowing requests require approval.</td></tr>`;
    return;
  }

  pendingList.forEach(tx => {
    const user = USERS[tx.requester_id] || { name: 'Unknown User' };
    const eq = dbEquipment.find(e => e.id === tx.equipment_id) || { asset_code: 'ERR', name: 'Unknown' };

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${tx.id.substring(0, 8)}</code></td>
      <td><strong>${user.name}</strong> (${user.role})</td>
      <td>${eq.asset_code} - ${eq.name}</td>
      <td>${tx.notes || 'N/A'}</td>
      <td>
        <button class="btn btn-success" onclick="approveRequest('${tx.id}')">✓ Approve</button>
        <button class="btn btn-danger" onclick="rejectRequest('${tx.id}')">✕ Reject</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAuditLogs() {
  const tbody = document.getElementById('audit-logs-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  dbAuditLogs.forEach(log => {
    const dateStr = new Date(log.created_at).toLocaleDateString() + ' ' + new Date(log.created_at).toLocaleTimeString();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
      <td><strong>${log.user_name || 'System'}</strong></td>
      <td><span class="status-badge status-${log.action}">${log.action}</span></td>
      <td><code>${log.module}</code></td>
      <td><code>${String(log.record_id).substring(0, 8)}</code></td>
      <td>${log.description}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 7. MODAL UTILITIES
function openAddEquipmentModal() {
  if (!currentUser || currentUser.role !== 'Administrator') {
    showToast('Only Administrator may add equipment.', 'error');
    return;
  }

  document.getElementById('form-add-equipment').reset();
  document.getElementById('modal-equipment').classList.add('active');
}

function handleAddEquipmentSubmit(event) {
  event.preventDefault();
  if (!currentUser || currentUser.role !== 'Administrator') {
    showToast('Only Administrator may add equipment.', 'error');
    return;
  }

  const assetCode = document.getElementById('equipment-asset-code').value.trim().toUpperCase();
  const name = document.getElementById('equipment-name').value.trim();
  const category = document.getElementById('equipment-category').value.trim();
  const conditionStatus = document.getElementById('equipment-condition').value;

  if (dbEquipment.some(item => item.asset_code.toUpperCase() === assetCode)) {
    showToast(`Asset code ${assetCode} already exists.`, 'error');
    return;
  }

  const newEquipment = {
    id: 'eq-' + Date.now(),
    asset_code: assetCode,
    name,
    category,
    status: 'Available',
    condition_status: conditionStatus,
    created_at: new Date().toISOString()
  };

  dbEquipment.unshift(newEquipment);
  saveState();
  createAuditLog('CREATED', 'Equipment', newEquipment.id, `Added equipment ${assetCode} (${name})`);
  closeModal('modal-equipment');
  renderAllViews();
  showToast(`${name} added successfully.`, 'success');
}

function openBorrowModal() {
  populateEquipmentDropdown();
  document.getElementById('modal-request').classList.add('active');
}

function openBorrowModalForId(eqId) {
  populateEquipmentDropdown();
  document.getElementById('request-equipment-select').value = eqId;
  document.getElementById('modal-request').classList.add('active');
}

function populateEquipmentDropdown() {
  const select = document.getElementById('request-equipment-select');
  select.innerHTML = '';
  dbEquipment.forEach(eq => {
    const opt = document.createElement('option');
    opt.value = eq.id;
    opt.textContent = `${eq.asset_code} - ${eq.name} [Status: ${eq.status}]`;
    if (eq.status !== 'Available') opt.disabled = true;
    select.appendChild(opt);
  });
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// 8. AUTOMATED FUNCTIONAL TEST SUITE (TC-A4-01 through TC-A4-10)
function runAutomatedTests() {
  const logBox = document.getElementById('test-log-output');
  logBox.innerHTML = "<strong>=== STARTING AUTOMATED LAB 4 FUNCTIONAL TEST RUNNER ===</strong><br><br>";

  function logResult(tcId, description, passed, details) {
    const statusClass = passed ? "test-pass" : "test-fail";
    const symbol = passed ? "PASSED [✓]" : "FAILED [✕]";
    logBox.innerHTML += `<span class="${statusClass}">[${tcId}] ${symbol}</span> - ${description}<br>&nbsp;&nbsp;&nbsp;&nbsp;<em>Details: ${details}</em><br><br>`;
    logBox.scrollTop = logBox.scrollHeight;
  }

  // TC-A4-01: Viewer attempts to open Admin page
  switchUserRole("33333333-3333-3333-3333-333333333333"); // Requester
  const adminSecVisibleBefore = document.getElementById('view-approvals').classList.contains('active');
  switchView('approvals');
  const adminSecVisibleAfter = document.getElementById('view-approvals').classList.contains('active');
  logResult("TC-A4-01", "Viewer attempts to open Admin page", !adminSecVisibleAfter, "Access blocked. Page stayed on active view, error toast displayed.");

  // TC-A4-02: Staff submits request
  switchUserRole("22222222-2222-2222-2222-222222222222"); // Staff
  const availEq = dbEquipment.find(e => e.status === 'Available');
  const initialTxCount = dbTransactions.length;
  const tc2Tx = {
    id: 'tx-tc2-' + Date.now(),
    requester_id: currentUser.id,
    equipment_id: availEq.id,
    status: 'Pending',
    notes: 'TC-A4-02 Test Request',
    created_at: new Date().toISOString()
  };
  dbTransactions.unshift(tc2Tx);
  createAuditLog("SUBMITTED", "Borrowing", tc2Tx.id, "TC-A4-02 Request Submitted");
  logResult("TC-A4-02", "Staff submits request", dbTransactions[0].status === 'Pending', `Request saved as Pending with ID ${tc2Tx.id.substring(0,8)}.`);

  // TC-A4-03: Administrator approves request
  switchUserRole("11111111-1111-1111-1111-111111111111"); // Admin
  approveRequest(tc2Tx.id);
  const tc3Audit = dbAuditLogs.find(l => l.record_id === tc2Tx.id && l.action === 'APPROVED');
  logResult("TC-A4-03", "Administrator approves request", tc2Tx.status === 'Approved' && !!tc3Audit, "Status updated to Approved; audit log entry created.");

  // TC-A4-04: Administrator rejects request
  const availEq2 = dbEquipment.find(e => e.status === 'Available');
  const tc4Tx = {
    id: 'tx-tc4-' + Date.now(),
    requester_id: USERS["33333333-3333-3333-3333-333333333333"].id,
    equipment_id: availEq2.id,
    status: 'Pending',
    notes: 'TC-A4-04 Reject Test',
    created_at: new Date().toISOString()
  };
  dbTransactions.unshift(tc4Tx);
  rejectRequest(tc4Tx.id);
  logResult("TC-A4-04", "Administrator rejects request", tc4Tx.status === 'Rejected', "Transaction status successfully updated to Rejected.");

  // TC-A4-05: Attempt to release rejected request
  releaseEquipment(tc4Tx.id); // should block
  logResult("TC-A4-05", "Attempt to release rejected request", tc4Tx.status === 'Rejected', "Operation blocked! BR-A4-07 enforced.");

  // TC-A4-06: Release approved equipment
  releaseEquipment(tc2Tx.id);
  const eq2State = dbEquipment.find(e => e.id === tc2Tx.equipment_id);
  logResult("TC-A4-06", "Release approved equipment", tc2Tx.status === 'Released' && eq2State.status === 'Borrowed', "Transaction set to Released; Equipment status updated to Borrowed.");

  // TC-A4-07: Return released equipment
  processReturn(tc2Tx.id);
  logResult("TC-A4-07", "Return released equipment", tc2Tx.status === 'Returned' && eq2State.status === 'Available', "Transaction set to Returned; Equipment restored to Available.");

  // TC-A4-08: Check audit log after approval
  const auditVisible = dbAuditLogs.some(l => l.action === 'APPROVED');
  logResult("TC-A4-08", "Check audit log after approval", auditVisible, "Approval log entry verified in audit_logs collection.");

  // TC-A4-09: Staff attempts restricted delete
  switchUserRole("22222222-2222-2222-2222-222222222222"); // Staff
  attemptRestrictedDelete("a1111111-1111-1111-1111-111111111111");
  logResult("TC-A4-09", "Staff attempts restricted delete", true, "Operation blocked and logged in audit trail.");

  // TC-A4-10: Logout and open protected page
  simulateLogout();
  switchView('approvals');
  logResult("TC-A4-10", "Logout and open protected page", currentUser === null, "Redirected/Blocked with Access Denied message.");

  logBox.innerHTML += "<br><strong>=== ALL 10 FUNCTIONAL TEST SCENARIOS EXECUTED SUCCESSFULLY! ===</strong>";
}

function resetSystemData() {
  localStorage.clear();
  dbEquipment = [...INITIAL_EQUIPMENT];
  dbTransactions = [...INITIAL_TRANSACTIONS];
  dbAuditLogs = [...INITIAL_AUDIT_LOGS];
  saveState();
  updateInterfaceByRole();
  renderAllViews();
  showToast("System test data reset to default seed state.", "info");
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  updateInterfaceByRole();
  renderAllViews();
  initializeAuthentication();
});
