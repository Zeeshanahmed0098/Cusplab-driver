// ==========================================
// 1. SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://roizxylwegnmxmwwtxht.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_mZTL2tHbdMEGPCy5ut3eww_fIlHd2uK"; 

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const seed = {
  brand: 'CUSP DENTAL LABORATORY',
  subtitle: 'Smart Case Tracking & Delivery',
  adminPin: '1234',
  driverPin: '1111',
  clinics: ['Samaya Bin Hamran BH', 'Pearl Clinic', 'ABC Dental Clinic']
};

let db = { ...seed, cases: [] };
let roleNow = 'driver';
let selectedId = null;
let html5QrCode = null;
let isScanning = false;
let filteredReportCases = [];
let adminFilter = 'all';
let canvas, ctx, drawing = false;

// ==========================================
// 2. FETCH DATA FROM SUPABASE
// ==========================================
async function fetchCases() {
  try {
    const { data, error } = await supabaseClient.from('Cusp-driver').select('*').order('id', { ascending: false });
    if (error) {
      alert("Database Error: " + error.message);
      return;
    }
    db.cases = data;
    if (roleNow === 'admin') {
      renderAdmin();
    } else {
      renderDriver();
    }
  } catch (err) {
    alert("System Error: " + err.message);
  }
}

// ==========================================
// 3. APP LOGIC
// ==========================================
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function status(s) {
  const cls = s === 'Signed' ? 'signed' : s === 'Issue Reported' ? 'issue' : '';
  return `<span class="pill ${cls}">${esc(s || 'Pending')}</span>`;
}

async function login() {
  try {
    const { data } = await supabaseClient.from('Settings').select('*').eq('id', 1).single();
    if (data) {
      db.adminPin = data.admin_pin;
      db.driverPin = data.driver_pin;
    }

    const r = document.getElementById('role').value;
    const p = document.getElementById('pin').value.trim();
    const expected = r === 'admin' ? db.adminPin : db.driverPin;
    
    if (p !== expected) {
      document.getElementById('loginError').textContent = 'Incorrect PIN.';
      return;
    }
    roleNow = r;
    document.getElementById('loginCard').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    document.querySelector('[data-tab="adminTab"]').classList.toggle('hidden', r !== 'admin');
    document.querySelector('[data-tab="reportsTab"]').classList.toggle('hidden', r !== 'admin');
    document.querySelector('[data-tab="settingsTab"]').classList.toggle('hidden', r !== 'admin');
    
    const first = r === 'admin' ? 'adminTab' : 'driverTab';
    showTab(first, document.querySelector(`[data-tab="${first}"]`));
    init();
  } catch (error) {
    alert("System Error: " + error.message);
  }
}

function logout() {
  if (isScanning) stopScanner();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginCard').classList.remove('hidden');
  document.getElementById('pin').value = '';
}

function showTab(id, btn) {
  if ((id === 'adminTab' || id === 'settingsTab' || id === 'reportsTab') && roleNow !== 'admin') return;
  if (id !== 'driverTab' && isScanning) stopScanner();

  document.querySelectorAll('#app section').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  fetchCases(); 
}

async function init() {
  const { data } = await supabaseClient.from('Settings').select('*').eq('id', 1).single();
  if (data) {
    db.adminPin = data.admin_pin;
    db.driverPin = data.driver_pin;
    db.brand = data.brand || db.brand;
    db.subtitle = data.subtitle || db.subtitle;
    db.avatar = data.avatar || '';
  }

  applyAppearance();
  document.getElementById('brandInput').value = db.brand;
  document.getElementById('subtitleInput').value = db.subtitle;
  
  const previewImg = document.getElementById('profilePreview');
  if (previewImg) previewImg.src = db.avatar;
  
  const today = new Date().toISOString().slice(0, 10);
  if (!document.getElementById('caseDate').value) document.getElementById('caseDate').value = today;
  document.getElementById('reportSingleDate').value = today;
  document.getElementById('reportStartDate').value = today.slice(0, 8) + '01';
  document.getElementById('reportEndDate').value = today;

  document.getElementById('servicesContainer').innerHTML = '';
  addServiceRow();

  fillClinics();
  fetchCases(); 
}

function applyAppearance() {
  document.getElementById('brandTitle').textContent = db.brand;
  document.getElementById('headerSubtitle').textContent = db.subtitle;
  
  const headerImg = document.getElementById('headerAvatar');
  if (headerImg) headerImg.src = db.avatar || '';

  const previewImg = document.getElementById('profilePreview');
  if (previewImg) previewImg.src = db.avatar || '';
}

function fillClinics(source) {
  const src = source || db;
  const opts = src.clinics.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  
  const cc = document.getElementById('caseClinic');
  const cv = cc.value;
  cc.innerHTML = opts;
  if (cv && src.clinics.includes(cv)) cc.value = cv;

  const ec = document.getElementById('editCaseClinic');
  const ecv = ec.value;
  ec.innerHTML = opts;
  if (ecv && src.clinics.includes(ecv)) ec.value = ecv;

  const rc = document.getElementById('reportClinic');
  const rv = rc.value;
  rc.innerHTML = '<option value="">All Clinics</option>' + opts;
  if (rv && src.clinics.includes(rv)) rc.value = rv;
}

function addServiceRow(name = '', qty = 1, price = '') {
  const container = document.getElementById('servicesContainer');
  const row = document.createElement('div');
  row.className = 'service-row';
  row.innerHTML = `
    <input type="text" class="service-name" placeholder="Service Name" value="${esc(name)}">
    <input type="number" class="service-qty" placeholder="Qty" min="1" value="${qty}" oninput="calcRowTotal(this)">
    <input type="number" class="service-price" placeholder="Unit Price" min="0" step="0.01" value="${price}" oninput="calcRowTotal(this)">
    <input type="number" class="service-total" placeholder="Row Total" readonly>
    <button class="danger btn-remove" onclick="this.parentElement.remove(); calcGrandTotal()">X</button>
  `;
  container.appendChild(row);
  if (price) calcRowTotal(row.querySelector('.service-price'));
}

function calcRowTotal(input) {
  const row = input.closest('.service-row');
  const qty = parseFloat(row.querySelector('.service-qty').value) || 0;
  const price = parseFloat(row.querySelector('.service-price').value) || 0;
  row.querySelector('.service-total').value = (qty * price).toFixed(2);
  calcGrandTotal();
}

function calcGrandTotal() {
  let total = 0;
  document.querySelectorAll('.service-row').forEach(row => {
    total += parseFloat(row.querySelector('.service-total').value) || 0;
  });
  document.getElementById('grandTotalDisplay').textContent = total.toFixed(2);
}

function editCase(id) {
  const c = db.cases.find(x => x.id == id);
  if (!c) return;

  document.getElementById('editCaseId').value = c.id;
  document.getElementById('editCaseClinic').value = c.clinic;
  document.getElementById('editPatient').value = c.patient;
  document.getElementById('editDoctor').value = c.doctor || '';
  document.getElementById('editJob').value = c.job;
  document.getElementById('editFile').value = c.file;
  document.getElementById('editStatus').value = c.status;
  document.getElementById('editDate').value = c.scheduled || '';

  const container = document.getElementById('editServicesContainer');
  container.innerHTML = '';
  if (c.services && c.services.length > 0) {
    c.services.forEach(s => addEditServiceRow(s.name, s.qty, s.unitPrice));
  } else {
    addEditServiceRow();
  }
  calcEditGrandTotal();

  document.getElementById('caseManageList').classList.add('hidden');
  document.getElementById('manageCasesTitle').textContent = "Editing: " + c.patient;
  document.getElementById('editCaseForm').classList.remove('hidden');
}

function addEditServiceRow(name = '', qty = 1, price = '') {
  const container = document.getElementById('editServicesContainer');
  const row = document.createElement('div');
  row.className = 'service-row';
  row.innerHTML = `
    <input type="text" class="service-name" placeholder="Service Name" value="${esc(name)}">
    <input type="number" class="service-qty" placeholder="Qty" min="1" value="${qty}" oninput="calcEditRowTotal(this)">
    <input type="number" class="service-price" placeholder="Unit Price" min="0" step="0.01" value="${price}" oninput="calcEditRowTotal(this)">
    <input type="number" class="service-total" placeholder="Row Total" readonly>
    <button class="danger btn-remove" onclick="this.parentElement.remove(); calcEditGrandTotal()">X</button>
  `;
  container.appendChild(row);
  if (price) calcEditRowTotal(row.querySelector('.service-price'));
}

function calcEditRowTotal(input) {
  const row = input.closest('.service-row');
  const qty = parseFloat(row.querySelector('.service-qty').value) || 0;
  const price = parseFloat(row.querySelector('.service-price').value) || 0;
  row.querySelector('.service-total').value = (qty * price).toFixed(2);
  calcEditGrandTotal();
}

function calcEditGrandTotal() {
  let total = 0;
  document.querySelectorAll('#editServicesContainer .service-row').forEach(row => {
    total += parseFloat(row.querySelector('.service-total').value) || 0;
  });
  document.getElementById('editGrandTotalDisplay').textContent = total.toFixed(2);
}

function cancelEdit() {
  document.getElementById('editCaseForm').classList.add('hidden');
  document.getElementById('caseManageList').classList.remove('hidden');
  document.getElementById('manageCasesTitle').textContent = "Manage cases";
}

async function saveEditedCase() {
  const id = document.getElementById('editCaseId').value;
  
  const rows = document.querySelectorAll('#editServicesContainer .service-row');
  let services = [];
  let grandTotal = 0;
  rows.forEach(r => {
    const name = r.querySelector('.service-name').value.trim();
    const qty = Number(r.querySelector('.service-qty').value) || 1;
    const price = Number(r.querySelector('.service-price').value) || 0;
    if (name) {
      services.push({ name, qty, unitPrice: price });
      grandTotal += (qty * price);
    }
  });

  if (services.length === 0) return alert("Please add at least one valid service.");

  const updates = {
    clinic: document.getElementById('editCaseClinic').value,
    patient: document.getElementById('editPatient').value.trim(),
    doctor: document.getElementById('editDoctor').value.trim(),
    job: document.getElementById('editJob').value.trim(),
    file: document.getElementById('editFile').value.trim(),
    status: document.getElementById('editStatus').value,
    scheduled: document.getElementById('editDate').value,
    services: services,
    amount: grandTotal
  };

  const { error } = await supabaseClient.from('Cusp-driver').update(updates).eq('id', id);
  if (error) {
    alert("Error updating: " + error.message);
  } else {
    cancelEdit(); 
    fetchCases(); 
    alert('✅ Case updated successfully in the database!');
  }
}

function startScanner() {
  if (isScanning) return;
  document.getElementById('reader').classList.remove('hidden');
  document.getElementById('startScanBtn').classList.add('hidden');
  document.getElementById('stopScanBtn').classList.remove('hidden');
  document.getElementById('scanStatus').textContent = 'Scanning... point camera at barcode.';
  
  html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" }, 
    { fps: 10, qrbox: { width: 250, height: 150 } },
    (decodedText) => {
      stopScanner();
      processScannedCode(decodedText);
    }
  ).catch(err => {
    alert('Camera error: ' + err);
    stopScanner();
  });
  isScanning = true;
}

function stopScanner() {
  if (html5QrCode && isScanning) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      isScanning = false;
      document.getElementById('reader').classList.add('hidden');
      document.getElementById('startScanBtn').classList.remove('hidden');
      document.getElementById('stopScanBtn').classList.add('hidden');
      document.getElementById('scanStatus').textContent = 'Camera is off.';
    }).catch(err => console.error(err));
  }
}

function manualLookup() {
  const val = document.getElementById('manualBarcode').value.trim();
  if (!val) return;
  processScannedCode(val);
  document.getElementById('manualBarcode').value = '';
}

function processScannedCode(code) {
  const foundCase = db.cases.find(c => (String(c.file) === String(code) || c.id == code || c.qrData === code) && c.status === 'Pending');
  
  if (foundCase) {
    selectedId = foundCase.id;
    renderDriver();
    document.getElementById('casePanel').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('scanStatus').textContent = '✅ Found: ' + foundCase.patient;
  } else {
    alert('❌ Barcode not found (or already submitted): ' + code);
    document.getElementById('scanStatus').textContent = 'Code not recognized. Try again.';
  }
}

function renderDriver() {
  let base = db.cases.filter(c => c.status === 'Pending');
  const search = (document.getElementById('driverSearch').value || '').toLowerCase();
  if (search) {
    base = base.filter(c => 
      (c.patient || '').toLowerCase().includes(search) || 
      (c.file || '').toLowerCase().includes(search) || 
      (c.job || '').toLowerCase().includes(search)
    );
  }

  document.getElementById('driverCases').innerHTML = base.length
    ? base.map(c => `
        <div class="case ${selectedId === c.id ? 'selected' : ''}" onclick="selectCase('${c.id}')">
          <div>
            <b>${esc(c.patient)}</b> · File: ${esc(c.file)}<br>
            <span class="muted">${esc(c.clinic)} · Job: ${esc(c.job)}</span>
          </div>
          ${status(c.status)}
        </div>`).join('')
    : '<p class="muted">No pending cases found.</p>';

  renderCasePanel();
}

function selectCase(id) {
  selectedId = id;
  renderDriver();
}

function renderCasePanel() {
  const p = document.getElementById('casePanel');
  const c = db.cases.find(x => x.id == selectedId);

  if (!c || c.status !== 'Pending') {
    p.innerHTML = '<h3 style="margin-top:0">Selected case details</h3><p class="muted">Choose a case above or scan a barcode to see details and confirm delivery.</p>';
    return;
  }

  let servicesHtml = '';
  if (c.services && c.services.length > 0) {
    servicesHtml = c.services.map(s => `<li>${esc(s.name)} (x${s.qty}) - SAR ${Number(s.unitPrice).toFixed(2)}</li>`).join('');
    servicesHtml = `<ul style="margin:5px 0; padding-left:20px; font-size:13px">${servicesHtml}</ul>`;
  }

  p.innerHTML = `
    <h3 style="margin-top:0">Case details</h3>
    <p><b>File No: ${esc(c.file)}</b> ${status(c.status)}</p>
    <table>
      <tr><th>Clinic</th><td>${esc(c.clinic)}</td></tr>
      <tr><th>Doctor</th><td>${esc(c.doctor)}</td></tr>
      <tr><th>Patient</th><td>${esc(c.patient)}</td></tr>
      <tr><th>Job Order</th><td>${esc(c.job)}</td></tr>
      <tr><th>Services</th><td>${servicesHtml}</td></tr>
      <tr><th>Total Amount</th><td><b>SAR ${Number(c.amount || 0).toFixed(2)}</b></td></tr>
    </table>
    
    <hr style="border:0;border-top:1px solid var(--line);margin:15px 0">
    <label>Receiver name</label>
    <input id="receiver" placeholder="Enter full name">
    
    <label>Receiver signature</label>
    <canvas id="sig" width="700" height="180"></canvas>
    <p>
      <button class="secondary" onclick="clearSig()">Clear</button>
      <button class="save-btn" onclick="saveSignature('${c.id}')">Save Signature & Confirm</button>
    </p>
    
    <hr style="border:0;border-top:1px solid var(--line);margin:15px 0">
    <label>Report an issue</label>
    <select id="issueReason">
      <option>Clinic closed</option>
      <option>Receiver unavailable</option>
      <option>Receiver refused to sign</option>
      <option>Case not found at clinic</option>
      <option>Wrong case / details mismatch</option>
      <option>Clinic asked to deliver later</option>
      <option>Other</option>
    </select>
    <textarea id="issueNotes" placeholder="Explanation"></textarea>
    <p><button class="danger" onclick="reportIssue('${c.id}')">Submit issue</button></p>
  `;

  setupCanvas();
}

function setupCanvas() {
  canvas = document.getElementById('sig');
  ctx = canvas.getContext('2d');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#173b60';

  function xy(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * canvas.width  / r.width,
      y: (e.clientY - r.top)  * canvas.height / r.height
    };
  }

  canvas.addEventListener('touchstart', e => { e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });

  canvas.onpointerdown = e => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const pt = xy(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };
  canvas.onpointermove = e => {
    if (!drawing) return;
    const pt = xy(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };
  canvas.onpointerup = () => drawing = false;
  canvas.onpointercancel = () => drawing = false;
}

function clearSig() {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function saveSignature(id) {
  const name = document.getElementById('receiver').value.trim();
  if (!name) { alert('Please enter the receiver name.'); return; }

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const hasInk = Array.from(pixels).some((v, i) => i % 4 === 3 && v > 0);
  if (!hasInk) { alert('Please sign in the box.'); return; }

  const updates = {
    status: 'Signed',
    receiver: name,
    signature: canvas.toDataURL(),
    signedAt: new Date().toISOString()
  };

  const { error } = await supabaseClient.from('Cusp-driver').update(updates).eq('id', id);
  if (error) { alert("Error: " + error.message); return; }

  selectedId = null; 
  fetchCases(); 
  alert('✅ Delivery confirmed & saved to cloud!');
}

async function reportIssue(id) {
  const updates = {
    status: 'Issue Reported',
    reason: document.getElementById('issueReason').value,
    notes: document.getElementById('issueNotes').value,
    signedAt: new Date().toISOString()
  };

  const { error } = await supabaseClient.from('Cusp-driver').update(updates).eq('id', id);
  if (error) { alert("Error: " + error.message); return; }

  selectedId = null; 
  fetchCases(); 
  alert('⚠ Issue reported & saved to cloud.');
}

function filterAdmin(type) {
  adminFilter = type;
  renderAdmin();
}

function renderAdmin() {
  if (roleNow !== 'admin') return;
  renderClinicManager();
  renderCaseManager();

  const all = db.cases;
  document.getElementById('totalCases').textContent = all.length;
  document.getElementById('signedCases').textContent = all.filter(c => c.status === 'Signed').length;
  document.getElementById('issueCases').textContent = all.filter(c => c.status === 'Issue Reported').length;
  document.getElementById('pendingCases').textContent = all.filter(c => c.status === 'Pending').length;

  document.querySelectorAll('.stat').forEach(el => el.classList.remove('active'));
  if (adminFilter === 'all') document.getElementById('stat-all').classList.add('active');
  if (adminFilter === 'Signed') document.getElementById('stat-signed').classList.add('active');
  if (adminFilter === 'Issue Reported') document.getElementById('stat-issue').classList.add('active');
  if (adminFilter === 'Pending') document.getElementById('stat-pending').classList.add('active');

  let filtered = all;
  let title = "All Delivery Records";
  
  if (adminFilter === 'Signed') {
    filtered = all.filter(c => c.status === 'Signed');
    title = "Signed Records";
  } else if (adminFilter === 'Issue Reported') {
    filtered = all.filter(c => c.status === 'Issue Reported');
    title = "Issue Reported Records";
  } else if (adminFilter === 'Pending') {
    filtered = all.filter(c => c.status === 'Pending');
    title = "Pending Records";
  }
  
  document.getElementById('adminRecordsTitle').textContent = title;

  document.getElementById('adminRecords').innerHTML = filtered.length
    ? `<table>
        <tr><th>File / Job</th><th>Patient</th><th>Amount</th><th>Status</th><th>Action</th></tr>
        ${filtered.map(c => `
          <tr>
            <td>${esc(c.file)}<br>${esc(c.job)}</td>
            <td>${esc(c.patient)}</td>
            <td>SAR ${Number(c.amount || 0).toFixed(2)}</td>
            <td>${status(c.status)}</td>
            <td>
              <button class="secondary" onclick="printSticker('${c.id}')">🖨️ Print</button>
              <button class="secondary" onclick="editCase('${c.id}')" style="margin-top:5px">✏️ Edit</button>
            </td>
          </tr>`).join('')}
      </table>`
    : '<p class="muted">No records found for this filter.</p>';
}

function renderClinicManager() {
  const el = document.getElementById('clinicManageList');
  el.innerHTML = db.clinics.map(clinic => `
    <div class="manage-row">
      <input value="${esc(clinic)}" id="clinic-input-${esc(clinic)}">
      <button class="secondary" onclick="renameClinic('${esc(clinic)}')">Rename</button>
      <button class="danger" onclick="deleteClinic('${esc(clinic)}')">Delete</button>
    </div>
  `).join('');
}

function addClinic() {
  const n = document.getElementById('newClinic').value.trim();
  if (!n) return;
  if (db.clinics.some(x => x.toLowerCase() === n.toLowerCase())) return alert('Already exists');
  db.clinics.push(n);
  document.getElementById('newClinic').value = '';
  fillClinics();
  renderClinicManager();
}

function renameClinic(oldName) {
  const newName = document.getElementById('clinic-input-' + oldName).value.trim();
  if (!newName || newName === oldName) return;
  db.clinics[db.clinics.indexOf(oldName)] = newName;
  fillClinics();
  renderClinicManager();
}

function deleteClinic(clinic) {
  if (!confirm('Delete clinic?')) return;
  db.clinics = db.clinics.filter(c => c !== clinic);
  fillClinics();
  renderClinicManager();
}

function renderCaseManager() {
  const el = document.getElementById('caseManageList');
  el.innerHTML = db.cases.map(c => `
    <div class="manage-row">
      <div style="flex:2">
        <b>${esc(c.clinic)}</b> <br>
        <span class="muted">Dr: ${esc(c.doctor)} · Pt: ${esc(c.patient)} · Job: ${esc(c.job)}</span>
      </div>
      ${status(c.status)}
      <button class="secondary" onclick="printSticker('${c.id}')">Print Sticker</button>
      <button class="secondary" onclick="editCase('${c.id}')">Edit</button>
      <button class="danger" onclick="deleteCase('${c.id}')">Delete</button>
    </div>
  `).join('');
}

async function addCase() {
  const clinic = document.getElementById('caseClinic').value;
  const patient = document.getElementById('patient').value.trim();
  const job = document.getElementById('job').value.trim();
  const fileNo = document.getElementById('file').value.trim();
  
  if (!clinic || !patient || !job || !fileNo) return alert('Clinic, Patient, Job Order, and File No are required.');

  const rows = document.querySelectorAll('#servicesContainer .service-row');
  let services = [];
  let grandTotal = 0;

  rows.forEach(r => {
    const name = r.querySelector('.service-name').value.trim();
    const qty = Number(r.querySelector('.service-qty').value) || 1;
    const price = Number(r.querySelector('.service-price').value) || 0;
    if (name) {
      services.push({ name, qty, unitPrice: price });
      grandTotal += (qty * price);
    }
  });

  if (services.length === 0) return alert("Please add at least one valid service.");

  const newCase = {
    clinic, patient, job,
    file: fileNo,
    doctor: document.getElementById('doctor').value,
    services: services,
    amount: grandTotal,
    scheduled: document.getElementById('caseDate').value,
    status: 'Pending',
    qrData: fileNo 
  };

  const { error } = await supabaseClient.from('Cusp-driver').insert([newCase]);
  if (error) { alert("Error saving to database: " + error.message); return; }

  ['patient','doctor','job','file'].forEach(x => document.getElementById(x).value = '');
  document.getElementById('servicesContainer').innerHTML = '';
  addServiceRow();
  calcGrandTotal();
  
  fetchCases(); 
  alert('Case added to cloud database!');
}

async function deleteCase(id) {
  if (!confirm('Delete this case?')) return;
  const { error } = await supabaseClient.from('Cusp-driver').delete().eq('id', id);
  if (error) { alert("Error: " + error.message); return; }
  fetchCases();
}

function toggleReportDates() {
  const type = document.getElementById('reportDateType').value;
  document.getElementById('singleDateDiv').classList.toggle('hidden', type !== 'single');
  document.getElementById('rangeDateDiv').classList.toggle('hidden', type !== 'range');
  renderReport();
}

function renderReport() {
  const clinic = document.getElementById('reportClinic').value;
  const statusFilter = document.getElementById('reportStatus').value;
  const type = document.getElementById('reportDateType').value;
  const search = (document.getElementById('reportSearch').value || '').toLowerCase();
  
  const singleDate = document.getElementById('reportSingleDate').value;
  const startDate = document.getElementById('reportStartDate').value;
  const endDate = document.getElementById('reportEndDate').value;

  filteredReportCases = db.cases.filter(c => {
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    if (clinic && c.clinic !== clinic) return false;
    
    // Apply Search Filter
    if (search) {
      const matchText = [c.patient, c.file, c.job, c.doctor].join(' ').toLowerCase();
      if (!matchText.includes(search)) return false;
    }

    const caseDate = (c.signedAt || c.scheduled || '').slice(0, 10);
    if (!caseDate) return false;
    if (type === 'single') {
      if (singleDate && caseDate !== singleDate) return false;
    } else {
      if (startDate && caseDate < startDate) return false;
      if (endDate && caseDate > endDate) return false;
    }
    return true;
  });

  document.getElementById('reportTitle').textContent = statusFilter + " Delivery Records";

  const el = document.getElementById('reportRecords');
  if (filteredReportCases.length === 0) {
    el.innerHTML = '<p class="muted">No records found for this filter.</p>';
    return;
  }

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Clinic / Dr Name</th>
          <th>Pt Name / File / Job</th>
          <th>Services</th>
          <th>Total</th>
          <th>Status / Details</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${filteredReportCases.map(c => {
          let srv = '';
          if(c.services && c.services.length > 0) srv = c.services.map(s => `${esc(s.name)} (x${s.qty})`).join('<br>');
          
          let detail = '';
          if (c.status === 'Signed') {
            detail = `<b>${esc(c.receiver)}</b><br>${c.signature ? `<img src="${c.signature}" class="sig-img">` : ''}`;
          } else if (c.status === 'Issue Reported') {
            detail = `<span style="color:#a52b2b;font-weight:bold">${esc(c.reason)}</span><br>${esc(c.notes)}`;
          } else {
            detail = status(c.status);
          }
          
          return `
          <tr>
            <td>${esc((c.signedAt || c.scheduled || '').slice(0, 10))}</td>
            <td>${esc(c.clinic)}<br><span class="muted">${esc(c.doctor)}</span></td>
            <td>
              <b>${esc(c.patient)}</b><br>
              File: ${esc(c.file)}<br>
              Job: ${esc(c.job)}
            </td>
            <td>${srv}</td>
            <td><b>SAR ${Number(c.amount || 0).toFixed(2)}</b></td>
            <td>${detail}</td>
            <td><button class="secondary" onclick="printSingleRecord('${c.id}')">🖨️ Print</button></td>
          </tr>`}).join('')}
      </tbody>
    </table>
  `;
}

function printFullReport() {
  if (filteredReportCases.length === 0) { alert("No records to print."); return; }

  const clinicFilter = document.getElementById('reportClinic').value || 'All Clinics';
  const statusFilter = document.getElementById('reportStatus').value;
  const type = document.getElementById('reportDateType').value;
  let dateLabel = '';
  
  if (type === 'single') {
    dateLabel = document.getElementById('reportSingleDate').value;
  } else {
    dateLabel = document.getElementById('reportStartDate').value + ' to ' + document.getElementById('reportEndDate').value;
  }

  let tableRows = filteredReportCases.map(c => {
    let srv = '';
    if(c.services && c.services.length > 0) srv = c.services.map(s => `${esc(s.name)} (x${s.qty})`).join('<br>');
    
    let detail = '';
    if (c.status === 'Signed') {
      detail = `<div style="font-size:12px;font-weight:bold">${esc(c.receiver)}</div>${c.signature ? `<img src="${c.signature}" style="max-width:80px;max-height:35px">` : ''}`;
    } else if (c.status === 'Issue Reported') {
      detail = `<span style="color:#a52b2b">${esc(c.reason)}</span><br>${esc(c.notes)}`;
    } else {
      detail = '<span style="color:#946200">Pending</span>';
    }
    
    return `
    <tr>
      <td>${esc((c.signedAt || c.scheduled || '').slice(0, 10))}</td>
      <td><b>${esc(c.clinic)}</b><br>${esc(c.doctor)}</td>
      <td><b>${esc(c.patient)}</b><br>F: ${esc(c.file)} | J: ${esc(c.job)}</td>
      <td>${srv}</td>
      <td>SAR ${Number(c.amount || 0).toFixed(2)}</td>
      <td style="text-align:center">${detail}</td>
    </tr>`}).join('');

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>${statusFilter} Delivery Report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h1 { color: #173b60; text-align: center; margin-bottom: 5px; }
      p.meta { text-align: center; font-size: 14px; color: #555; margin-top: 0; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #cbd5df; padding: 8px; text-align: left; vertical-align: middle; }
      th { background: #edf2f7; }
      .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #777; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>
      <h1>${esc(db.brand)}</h1>
      <p class="meta"><b>${statusFilter} Delivery Report</b> | Clinic: ${esc(clinicFilter)} | Date: ${esc(dateLabel)}</p>
      <table>
        <thead>
          <tr><th>Date</th><th>Clinic / Dr</th><th>Patient / Ref</th><th>Services</th><th>Amount</th><th>Details / Sign</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">Generated on ${new Date().toLocaleString()}</div>
      <script>window.onload = () => window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

function printSingleRecord(id) {
  const c = db.cases.find(x => x.id == id);
  if (!c) return;

  let srvRows = '';
  if(c.services && c.services.length > 0) {
    c.services.forEach(s => {
      srvRows += `
        <tr><td>${esc(s.name)}</td><td>${esc(s.qty)}</td><td>SAR ${Number(s.unitPrice).toFixed(2)}</td><td>SAR ${Number(s.qty * s.unitPrice).toFixed(2)}</td></tr>
      `;
    });
  }

  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>Delivery Record - ${esc(c.file)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 30px; }
      .invoice { border: 1px solid #ccc; padding: 25px; max-width: 600px; margin: 0 auto; border-radius: 8px; }
      h2 { color: #173b60; margin-top: 0; text-align: center; border-bottom: 2px solid #173b60; padding-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
      th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
      td:first-child { font-weight: bold; color: #555; }
      .totals { text-align: right; font-size: 16px; font-weight: bold; margin-top: 15px; }
      .signature-box { margin-top: 30px; text-align: center; border-top: 1px dashed #ccc; padding-top: 15px; }
      .signature-box img { max-width: 250px; max-height: 80px; }
      .sig-label { font-size: 12px; color: #555; margin-bottom: 5px; }
      @media print { body { padding: 0; } .invoice { border: none; } }
    </style>
    </head><body>
      <div class="invoice">
        <h2>${esc(db.brand)}</h2>
        <table>
          <tr><td>Status</td><td>${status(c.status)}</td></tr>
          <tr><td>Clinic Name</td><td>${esc(c.clinic)}</td></tr>
          <tr><td>Dr Name</td><td>${esc(c.doctor)}</td></tr>
          <tr><td>Patient Name</td><td>${esc(c.patient)}</td></tr>
          <tr><td>Job Order</td><td>${esc(c.job)}</td></tr>
          <tr><td>File Number</td><td>${esc(c.file)}</td></tr>
          <tr><td>Date</td><td>${esc((c.signedAt || c.scheduled || '').slice(0, 10))}</td></tr>
        </table>
        
        <table style="margin-top:20px;">
          <thead>
            <tr><th>Service</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
          </thead>
          <tbody>${srvRows}</tbody>
        </table>
        <div class="totals">Grand Total: SAR ${Number(c.amount || 0).toFixed(2)}</div>
        
        <div class="signature-box">
          ${c.status === 'Signed' 
            ? `<div class="sig-label">Receiver Name: <b>${esc(c.receiver)}</b></div>
               ${c.signature ? `<img src="${c.signature}">` : '<div style="color:#a52b2b;font-size:12px">No signature provided</div>'}`
            : c.status === 'Issue Reported'
              ? `<div style="color:#a52b2b;font-weight:bold">Issue: ${esc(c.reason)}</div><div>${esc(c.notes)}</div>`
              : `<div style="color:#946200;font-weight:bold">Status: Pending Delivery</div>`}
        </div>
      </div>
      <script>window.onload = () => window.print();<\/script>
    </body></html>
  `);
  w.document.close();
}

function printSticker(id) {
  const c = db.cases.find(x => x.id == id);
  if (!c) return;
  const w = window.open('', '_blank', 'width=450,height=550');
  w.document.write(`
    <html><head><title>Zebra Sticker</title>
    <style>
      @page { margin: 0; }
      body { 
        font-family: Arial, sans-serif; 
        text-align: center; 
        padding: 10px; 
        margin: 0;
      }
      .sticker { 
        border: 2px solid #000; 
        padding: 15px; 
        width: 280px; 
        margin: 0 auto; 
        text-align: left;
      }
      h2 { 
        margin: 0 0 10px 0; 
        font-size: 18px; 
        text-align: center;
        border-bottom: 1px dashed #000;
        padding-bottom: 5px;
      }
      svg { max-width: 100%; height: 60px; margin: 10px 0; display: block; margin-left: auto; margin-right: auto; }
      .row { 
        margin: 8px 0; 
        font-size: 14px; 
      }
      .row b { 
        display: inline-block; 
        width: 60px; 
      }
      button { 
        margin-top: 20px; 
        padding: 10px 20px; 
        cursor: pointer; 
        background: #16794b;
        color: white;
        border: none;
        border-radius: 5px;
        font-weight: bold;
      }
      @media print { 
        button { display: none; } 
        .sticker { border: none; } 
        body { padding: 0; }
      }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
    </head><body>
      <div class="sticker">
        <h2>CUSP DENTAL LABORATORY</h2>
        <svg id="barcode"></svg>
        <div class="row"><b>Clinic:</b> ${esc(c.clinic)}</div>
        <div class="row"><b>Doctor:</b> ${esc(c.doctor)}</div>
        <div class="row"><b>Patient:</b> ${esc(c.patient)}</div>
        <div class="row"><b>Job No:</b> ${esc(c.job)}</div>
      </div>
      <button onclick="window.print()">🖨️ Print Sticker</button>
      <script>
        setTimeout(() => {
          if (typeof JsBarcode !== 'undefined') {
            JsBarcode("#barcode", "${esc(c.file)}", {
              format: "CODE128",
              width: 2,
              height: 60,
              displayValue: false
            });
          } else {
            alert("Barcode library failed to load.");
          }
        }, 500);
      <\/script>
    </body></html>
  `);
  w.document.close();
}

async function saveAppearance() {
  const newBrand = document.getElementById('brandInput').value.trim() || 'CUSP DENTAL LABORATORY';
  const newSubtitle = document.getElementById('subtitleInput').value.trim();
  
  const updates = { brand: newBrand, subtitle: newSubtitle, avatar: db.avatar };

  const { error } = await supabaseClient.from('Settings').update(updates).eq('id', 1);
  
  if (error) {
    alert("Error saving appearance: " + error.message);
    return;
  }

  db.brand = newBrand;
  db.subtitle = newSubtitle;
  applyAppearance();
  alert('✅ Appearance updated in the cloud!');
}

function loadAvatar(e) {
  const reader = new FileReader();
  reader.onload = () => {
    db.avatar = reader.result;
    document.getElementById('profilePreview').src = reader.result;
    document.getElementById('headerAvatar').src = reader.result;
  };
  if(e.target.files[0]) reader.readAsDataURL(e.target.files[0]);
}

async function savePins() {
  const newAdmin = document.getElementById('newAdminPin').value.trim();
  const newDriver = document.getElementById('newDriverPin').value.trim();
  
  if (!newAdmin && !newDriver) {
    alert("Please type a new PIN first.");
    return;
  }
  
  const updates = {};
  if (newAdmin) updates.admin_pin = newAdmin;
  if (newDriver) updates.driver_pin = newDriver;

  const { error } = await supabaseClient.from('Settings').update(updates).eq('id', 1);
  
  if (error) {
    alert("Error saving PINs: " + error.message);
    return;
  }
  
  if (newAdmin) db.adminPin = newAdmin;
  if (newDriver) db.driverPin = newDriver;
  
  document.getElementById('newAdminPin').value = '';
  document.getElementById('newDriverPin').value = '';
  alert('✅ PINs updated successfully in the cloud!');
}

// ==========================================
// 4. PDF EXTRACTION (SMARTER REGEX)
// ==========================================
async function processPDF() {
  const fileInput = document.getElementById('pdfFile');
  if (!fileInput.files.length) return alert('Please select a PDF file first.');
  
  const file = fileInput.files[0];
  const statusText = document.getElementById('pdfStatus');
  statusText.textContent = "Reading PDF...";

  const reader = new FileReader();
  reader.onload = async function() {
    const typedarray = new Uint8Array(this.result);
    
    try {
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.textContent;
        const pageText = textContent.items.map(item => item.str).join('  '); // Double space to separate words
        fullText += pageText + "  ";
      }

      statusText.textContent = "Extracting data...";

      // SMARTER REGEX: Looks for the keyword, then grabs text UNTIL it hits the next keyword.
      
      // Patient: Stops when it sees "File No", "Due Date", "Dentist", etc.
      const patientMatch = fullText.match(/Patient\s+(.*?)(?=\s+(?:File No|Due Date|Dentist|Status|Job Order))/i);
      const patient = patientMatch ? patientMatch[1].trim() : '';

      // Dentist: Stops when it sees "Status", "Created At", "Pickup"
      const doctorMatch = fullText.match(/Dentist\s+(.*?)(?=\s+(?:Status|Created At|Pickup|File No))/i);
      const doctor = doctorMatch ? doctorMatch[1].trim() : '';

      // File No: Grabs just the numbers
      const fileMatch = fullText.match(/File No\s+(\d+)/i);
      const fileNo = fileMatch ? fileMatch[1].trim() : '';

      // Job Order: Grabs just the numbers
      const jobMatch = fullText.match(/Job Order\s+(\d+)/i);
      const jobNo = jobMatch ? jobMatch[1].trim() : '';

      // Clinic: Stops when it sees "Patient" or "Dentist"
      const clinicMatch = fullText.match(/Clinic\s+(.*?)(?=\s+(?:Patient|Dentist|File No))/i);
      let clinicName = clinicMatch ? clinicMatch[1].trim() : '';

      // Amount
      const amountMatch = fullText.match(/SAR\s*([0-9.]+)/i);
      const amount = amountMatch ? Number(amountMatch[1]) : 0;

      // Service Name (Usually all caps before "x" and quantity)
      const serviceMatch = fullText.match(/([A-Z\s]+)\s+[0-9]+\s*x\s*[0-9]+/);
      const serviceName = serviceMatch ? serviceMatch[1].trim() : 'Dental Service';
      
      // Date
      const dateMatch = fullText.match(/(\d{2})-(\d{2})-(\d{4})/);
      let scheduledDate = new Date().toISOString().slice(0, 10);
      if (dateMatch) {
        scheduledDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      }

      // --- FILL THE FORM ---
      document.getElementById('patient').value = patient;
      document.getElementById('doctor').value = doctor;
      document.getElementById('job').value = jobNo;
      document.getElementById('file').value = fileNo;
      document.getElementById('caseDate').value = scheduledDate;
      
      // Update Services
      const servicesContainer = document.getElementById('servicesContainer');
      servicesContainer.innerHTML = '';
      const row = document.createElement('div');
      row.className = 'service-row';
      row.innerHTML = `
        <input type="text" class="service-name" value="${serviceName}">
        <input type="number" class="service-qty" value="1" oninput="calcRowTotal(this)">
        <input type="number" class="service-price" value="${amount}" oninput="calcRowTotal(this)">
        <input type="number" class="service-total" value="${amount}" readonly>
        <button class="danger btn-remove" onclick="this.parentElement.remove(); calcGrandTotal()">X</button>
      `;
      servicesContainer.appendChild(row);
      calcGrandTotal();

      // --- CLINIC DROPDOWN LOGIC ---
      const clinicDropdown = document.getElementById('caseClinic');
      let foundClinic = false;
      
      // Try to find a matching clinic in the dropdown list
      for (let i = 0; i < clinicDropdown.options.length; i++) {
        const optionText = clinicDropdown.options[i].value;
        // If the option includes the extracted clinic name (e.g., "Pearl" matches "Pearl Clinic")
        if (optionText.toLowerCase().includes(clinicName.toLowerCase()) && clinicName !== '') {
          clinicDropdown.selectedIndex = i;
          foundClinic = true;
          break;
        }
      }

      // If not found, make it empty
      if (!foundClinic) {
        clinicDropdown.selectedIndex = -1; // This makes it blank
      }

      statusText.textContent = "Data extracted! Please review the form below and click Save.";
      
    } catch (error) {
      console.error(error);
      alert("Failed to read PDF. Make sure it's a valid file.");
      statusText.textContent = "Error reading PDF.";
    }
  };
  
  reader.readAsArrayBuffer(file);
}

// ==========================================
// 5. INITIALIZE BUTTON & FETCH APPEARANCE
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('loginBtn').addEventListener('click', login);
  
  const { data } = await supabaseClient.from('Settings').select('*').eq('id', 1).single();
  if (data) {
    db.brand = data.brand || db.brand;
    db.subtitle = data.subtitle || db.subtitle;
    db.avatar = data.avatar || '';
    applyAppearance(); 
  }
});