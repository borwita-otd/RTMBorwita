// ===== TALENT MANAGEMENT SYSTEM - APP.JS =====



// --- NAVIGATION ---
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelector(`.nav-item[data-page="${id}"]`).classList.add('active');
  if (id === 'dashboard') renderDashboard();
  if (id === 'recommendation') populateVacancyDropdown();
  if (id === 'talentsearch') initTSFilters();
  if (id === 'masterfilter') renderPriorityEditor();
}

// --- NAVIGATE FROM DASHBOARD TO RECOMMENDATION ---
function goToRecommendation(vacIdx) {
  // Switch page
  showPage('recommendation');
  // Select the vacancy and auto-generate
  selectedVacancyIdx = vacIdx;
  const d = vacancyData[vacIdx];
  if (!d) return;
  document.getElementById('recVacancyInput').value = `${d.posisi} (${d.level}) — ${d.branch}, ${d.region}`;
  // Auto-generate (wait for HAV data if not loaded yet)
  if (HAV_DB.length === 0) {
    showToast('⏳ Menunggu data HAV_Matrix...');
    const waitInterval = setInterval(() => {
      if (HAV_DB.length > 0) {
        clearInterval(waitInterval);
        generateRecommendation();
        showToast(`✅ Membuka rekomendasi: ${d.posisi}`);
      }
    }, 500);
  } else {
    generateRecommendation();
    showToast(`✅ Membuka rekomendasi: ${d.posisi}`);
  }
}

// --- GAS CONFIG ---
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyW8Q5yxdITkc03_LnwIbkXcX-lvNZ6004h-z2BS3SVy0QKLorjilm5gdBdDt4eGJuK/exec';

// --- DATA STORES ---
let vacancyData = [];
let HAV_DB = [];
let currentEligibleCandidates = [];

// --- FETCH INITIAL DATA ---
async function fetchInitialData() {
  document.getElementById('dashBody').innerHTML = '<tr><td colspan="18" style="text-align:center;padding:40px;">⏳ Loading data from Google Sheets...</td></tr>';

  try {
    // Fetch BOTH in parallel for faster loading
    const [resDash, resHAV] = await Promise.all([
      fetch(`${GAS_URL}?action=getDashboard`),
      fetch(`${GAS_URL}?action=getHAV`)
    ]);

    const dataDash = await resDash.json();
    if (dataDash.success) {
      vacancyData = dataDash.data;
      renderDashboard();
      populateVacancyDropdown();
    } else {
      console.error("Dashboard error:", dataDash.error);
      showToast("❌ Error loading Dashboard data: " + dataDash.error);
    }

    const dataHAV = await resHAV.json();
    if (dataHAV.success) {
      HAV_DB = dataHAV.data;
    } else {
      console.error("HAV error:", dataHAV.error);
      showToast("❌ Error loading HAV data: " + dataHAV.error);
    }

  } catch (error) {
    console.error("Fetch error:", error);
    document.getElementById('dashBody').innerHTML = '<tr><td colspan="18" style="text-align:center;padding:40px;color:red;">❌ Error loading data. See console.</td></tr>';
    showToast("❌ Network error connecting to Google Sheets");
  }
}



// Grade hierarchy: G1=A&T, G2=Coordinator, G3=Supervisor, G4=Manager, G5=Head, G6=GM, G7=Direktur
// For vacancy G3(Supervisor), candidates should be G1 and G2
function getTargetGrades(vacancyLevel) {
  const num = parseInt(vacancyLevel.replace(/\D/g, '')) || 0;
  const grades = [];
  // Candidates 1-2 levels below
  if (num - 1 >= 1) grades.push('G' + (num - 1));
  if (num - 2 >= 1) grades.push('G' + (num - 2));
  return grades;
}

// Helper to parse panel string
function parsePanelStr(str) {
  const parts = str.split('---').map(s => s.trim());
  return { name: parts[0] || str, date: parts[1] || '', note: parts[2] || '' };
}

// Helper: format date string "YYYY-MM-DD" → "Mei 2026"
function formatBulanFromDate(dateStr) {
  if (!dateStr) return '';
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return BULAN[d.getMonth()] + ' ' + d.getFullYear();
}

// --- RENDER DASHBOARD ---
function renderDashboard() {
  const q = (document.getElementById('dashSearch')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('dashStatusFilter')?.value || 'ALL';
  const dateStart = document.getElementById('dashDateStart')?.value;
  const dateEnd = document.getElementById('dashDateEnd')?.value;
  const body = document.getElementById('dashBody');
  if (!body) return;

  // ================= 1. REVISI UTAMA: SORTING (TERAKHIR DIEDIT / DIBUAT) =================
  vacancyData.sort((a, b) => {
    // Ambil waktu edit terakhir (lastEdited)
    // Jika belum pernah diedit, gunakan waktu dibuat (timestamp) sebagai cadangan
    // Jika keduanya kosong, gunakan nilai 0 (waktu lampau)
    const timeA = a.lastEdited ? new Date(a.lastEdited).getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
    const timeB = b.lastEdited ? new Date(b.lastEdited).getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
    
    return timeB - timeA; // Mengurutkan dari yang paling baru ke terlama
  });
  // ====================================================================================

  // Date filter for stats
  let statsData = vacancyData;
  if (dateStart || dateEnd) {
    statsData = vacancyData.filter(d => {
      if (!d.timestamp) return true;
      const ts = new Date(d.timestamp).toISOString().slice(0, 10);
      if (dateStart && ts < dateStart) return false;
      if (dateEnd && ts > dateEnd) return false;
      return true;
    });
  }

  let total = statsData.length, open = 0, fulfilled = 0, hold = 0, cancel = 0;
  statsData.forEach(d => {
    const s = String(d.status).trim().toLowerCase();
    if (s === 'open') open++;
    else if (s === 'closed') fulfilled++;
    else if (s === 'hold') hold++;
    else if (s === 'cancel') cancel++;
  });
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statOpen').textContent = open;
  document.getElementById('statFulfilled').textContent = fulfilled;
  document.getElementById('statHold').textContent = hold;
  document.getElementById('statCancel').textContent = cancel;

  let html = '';
  
  // Variabel counter manual untuk penomoran baris yang lolos filter
  let displayNo = 1;

  vacancyData.forEach((d, i) => {
    // Date filter — apply to table rows too
    if (dateStart || dateEnd) {
      if (!d.timestamp) { /* keep rows without timestamp */ }
      else {
        const ts = new Date(d.timestamp).toISOString().slice(0, 10);
        if (dateStart && ts < dateStart) return;
        if (dateEnd && ts > dateEnd) return;
      }
    }

    if (statusFilter === 'OPEN' && d.status !== 'Open') return;
    if (statusFilter === 'HOLD' && d.status !== 'Hold') return;
    if (statusFilter === 'CLOSED' && (d.status !== 'Closed' && d.status !== 'Cancel')) return;

    const searchStr = [d.pemohon, d.posisi, d.region, d.branch, ...(d.talentList || []), ...(d.talentRec || [])].join(' ').toLowerCase();
    if (q && !searchStr.includes(q)) return;

    // Talent Rec (from form)
    const tRecHtml = (d.talentRec || []).length
      ? '<ul class="td-list">' + d.talentRec.map(t => '<li>' + t + '</li>').join('') + '</ul>'
      : '<span style="color:#94a3b8;font-size:11px;font-style:italic">-</span>';

    // Talent List (from RTM checked candidates)
    const tListHtml = (d.talentList || []).length
      ? '<ol style="margin:0;padding-left:16px;font-size:12px;">' + d.talentList.map(t => '<li>' + t + '</li>').join('') + '</ol>'
      : '<span style="color:#94a3b8;font-size:11px;font-style:italic">-</span>';

    // Panel Interview - clickable button
    const panelCount = (d.panelApproved || []).length;
    const panelBtnText = panelCount > 0 ? panelCount + ' kandidat' : 'Kelola';

    // Successor - dropdown from panel approved
    const approvedCandidates = d.panelApproved || [];
    let sucHtml = '<select class="source-select" onchange="setSuccessor(' + d.rowIndex + ',this.value)" style="min-width:120px;"><option value="">- Pilih -</option>';
    approvedCandidates.forEach(item => {
      const p = parsePanelStr(item);
      sucHtml += '<option value="' + p.name + '" ' + (d.successor === p.name ? 'selected' : '') + '>' + p.name + '</option>';
    });
    sucHtml += '</select>';
    if (!approvedCandidates.length) sucHtml = '<span style="color:#94a3b8;font-size:11px;font-style:italic">Panel dulu</span>';

    // ================= 2. REVISI NOMOR URUT (displayNo++) =================
    // Menggunakan incremental counter agar nomor baris konsisten urut 1, 2, 3...
    const currentNumber = displayNo++;
    // ======================================================================

    // Format Tanggal Request (Menggunakan timestamp atau requestDate dari data Google Sheet)
    let reqDateFormatted = '-';
    if (d.timestamp) {
      const dt = new Date(d.timestamp);
      reqDateFormatted = !isNaN(dt.getTime()) 
        ? dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) 
        : d.timestamp;
    } else if (d.requestDate) {
      reqDateFormatted = d.requestDate;
    }

    html += `<tr>
      <td><span class="row-num">${currentNumber}</span></td>
      
      <!-- 1. TAMBAHKAN KOLOM REQUEST DATE DI SINI (Kolom Ke-2) -->
      <td style="white-space:nowrap;font-size:12px;color:#64748b;">${reqDateFormatted}</td>
      
      <!-- 2. KOLOM REQUESTOR SEKARANG MENJADI KOLOM KE-3 -->
      <td style="font-weight:600">${d.pemohon}</td>
      <td><span class="posisi-link" onclick="goToRecommendation(${vacancyData.indexOf(d)})" title="Klik untuk generate rekomendasi">${d.posisi}</span></td>
      <td>${d.level}</td>
      <td>${d.region}</td>
      <td>${d.branch}</td>
      <td>${d.workLoc}</td>
      <td>${d.principle}</td>
      <td>${d.reason}</td>
      <td style="font-size:12px;">${d.department || '<span style="color:#94a3b8;font-size:11px;font-style:italic">-</span>'}</td>
      <td>${tRecHtml}</td>
      <td>${tListHtml}<div style="margin-top:6px;"><span class="posisi-link" onclick="goToRecommendation(${vacancyData.indexOf(d)})" title="Generate rekomendasi kandidat" style="font-size:11px;display:inline-flex;align-items:center;gap:3px;">⭐ Generate Candidate</span></div></td>
      <td style="text-align:center;font-weight:700">${d.manpower}</td>
      <td><button class="btn-edit" onclick="openPanelModal(${d.rowIndex})" style="white-space:nowrap;">📋 ${panelBtnText}</button></td>
      <td>${sucHtml}</td>
      <td><select class="source-select" onchange="setSuccessorBranch(${d.rowIndex},this.value)" style="min-width:130px;">
        <option value="">- Pilih Branch -</option>
        ${['Pusat','Surabaya','Kediri','Madiun','Makassar','Latubo','Bandung','Bali','Malang','Jember','Yogyakarta','Semarang','Cirebon','Tegal','Madura','Palopo','Pare-Pare','Mamuju','Lombok','Manado','Puma','Solo','Palu','Jakarta','Ternate','Purwokerto','Sukabumi','Tasikmalaya','Subang','Pati','Kendari','Kupang','Gorontalo','Poso','Bone','Karawang','Bau-Bau','Sumbawa','Bengkulu','Bima','Maumere','Lampung','Cikarang','Klaten','Ruteng','Palembang'].map(b => `<option value="${b}" ${d.successorBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
      </select></td>
      <td>
        <input type="date" 
              class="input-field" 
              value="${formatEffectiveDateForInput(d.effectiveDate)}" 
              onchange="setEffectiveDate(${d.rowIndex},this.value)" 
              style="width:130px;padding:5px 8px;font-size:12px;">
      </td>
      <td>${d.bulanPanel || '<span style="color:#94a3b8;font-size:11px;font-style:italic">-</span>'}</td>
      <td><select class="source-select" onchange="changeSource(${d.rowIndex},this.value)">
        <option value="" ${!d.source ? 'selected' : ''}>-</option>
        <option value="Internal" ${d.source === 'Internal' ? 'selected' : ''}>Internal</option>
        <option value="Eksternal" ${d.source === 'Eksternal' ? 'selected' : ''}>Eksternal</option>
        <option value="Mutasi" ${d.source === 'Mutasi' ? 'selected' : ''}>Mutasi</option>
      </select></td>
      <td><select class="status-select ssel-${d.status}" onchange="changeStatus(${d.rowIndex},this.value);this.className='status-select ssel-'+this.value">
        <option value="Open" ${d.status === 'Open' ? 'selected' : ''}>Open</option>
        <option value="Closed" ${d.status === 'Closed' ? 'selected' : ''}>Closed</option>
        <option value="Cancel" ${d.status === 'Cancel' ? 'selected' : ''}>Cancel</option>
        <option value="Hold" ${d.status === 'Hold' ? 'selected' : ''}>Hold</option>
      </select></td>
    </tr>`;
  });
  body.innerHTML = html;
}

// Helper: find vacancy by rowIndex
function findVacancyByRowIndex(rowIndex) {
  return vacancyData.find(d => d.rowIndex === rowIndex);
}

async function changeStatus(rowIndex, val) {
  const d = findVacancyByRowIndex(rowIndex);
  if (!d) return;
  d.status = val;
  renderDashboard();

  // Save to Google Sheet
  showToast("⏳ Saving status...");
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateDashboard',
        rowIndex: d.rowIndex,
        status: val
      })
    });
    showToast("✅ Status updated");
  } catch (e) {
    console.error(e);
    showToast("❌ Failed to update status");
  }
}

async function changeSource(rowIndex, val) {
  const d = findVacancyByRowIndex(rowIndex);
  if (!d) return;
  d.source = val;

  showToast("⏳ Saving source...");
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateDashboard',
        rowIndex: d.rowIndex,
        source: val
      })
    });
    showToast("✅ Source updated");
  } catch (e) {
    console.error(e);
    showToast("❌ Failed to update source");
  }
}

// --- PANEL INTERVIEW MODAL ---
let panelRowIndex = null;


function openPanelModal(rowIndex) {
  const d = findVacancyByRowIndex(rowIndex);
  if (!d) return;
  panelRowIndex = rowIndex;
  document.getElementById('panelVacName').textContent = d.posisi;
  // bulanPanel sekarang auto-derived dari tanggal panel — tidak perlu set input
  // Create lookup for existing panel data
  const approvedMap = {};
  (d.panelApproved || []).forEach(item => {
    const p = parsePanelStr(item);
    approvedMap[p.name] = p;
  });

  const candidates = d.talentList || [];
  const listDiv = document.getElementById('panelCandidateList');

  if (candidates.length === 0) {
    listDiv.innerHTML = '<p style="color:#94a3b8;font-style:italic;">Belum ada kandidat di Talent List. Pilih kandidat di Recommendation RTM terlebih dahulu.</p>';
  } else {
    listDiv.innerHTML = candidates.map((name, idx) => {
      const pData = approvedMap[name];
      const isChecked = pData ? 'checked' : '';
      const displayDetails = pData ? 'flex' : 'none';
      const dateVal = pData ? pData.date : '';
      const noteVal = pData ? pData.note : '';

      return `
      <div style="background:#f9fafb;border-radius:8px;margin-bottom:8px;border:1px solid #e5e7eb;overflow:hidden;">
        <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;">
          <input type="checkbox" class="panel-check" data-idx="${idx}" value="${name}" ${isChecked} onchange="togglePanelDetails(${idx}, this.checked)">
          <span style="font-weight:600;font-size:14px;">${idx + 1}. ${name}</span>
        </label>
        <div id="panel-details-${idx}" style="display:${displayDetails};gap:10px;padding:0 14px 14px 44px;flex-wrap:wrap;">
          <div style="flex:1;min-width:140px;">
            <label style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px;">Tanggal Panel</label>
            <input type="date" id="panel-date-${idx}" value="${dateVal}" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;">
          </div>
          <div style="flex:2;min-width:200px;">
            <label style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px;">Catatan (Opsional)</label>
            <textarea 
              id="panel-note-${idx}" 
              placeholder="Hasil panel..." 
              rows="2" 
              style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; font-family:inherit; resize:vertical; box-sizing:border-box;"
            >${noteVal}</textarea>
          </div>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('panelModal').classList.remove('hidden');
}

function togglePanelDetails(idx, checked) {
  const el = document.getElementById('panel-details-' + idx);
  if (el) el.style.display = checked ? 'flex' : 'none';
}

function closePanelModal() {
  document.getElementById('panelModal').classList.add('hidden');
}

async function savePanelInterview() {
  const d = findVacancyByRowIndex(panelRowIndex);
  if (!d) return;

  const approved = [];
  document.querySelectorAll('.panel-check:checked').forEach(cb => {
    const name = cb.value;
    const idx = cb.getAttribute('data-idx');
    const dateVal = document.getElementById('panel-date-' + idx).value;
    const noteVal = document.getElementById('panel-note-' + idx).value.trim();
    // Format: Name --- Date --- Note
    approved.push(`${name} --- ${dateVal} --- ${noteVal}`);
  });

  d.panelApproved = approved;

  // Auto-derive bulanPanel dari tanggal panel kandidat pertama yang dicentang
  // (tidak perlu input manual lagi)
  if (approved.length > 0) {
    const firstDate = parsePanelStr(approved[0]).date;
    d.bulanPanel = formatBulanFromDate(firstDate);
  } else {
    d.bulanPanel = '';
  }

  // If successor was set but is no longer in approved list, clear it
  if (d.successor) {
    const isStillApproved = approved.some(item => parsePanelStr(item).name === d.successor);
    if (!isStillApproved) d.successor = '';
  }

  closePanelModal();
  renderDashboard();
  showToast('\u23f3 Saving panel data...');

  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateDashboard',
        rowIndex: d.rowIndex,
        panelInterview: approved.join('|'),
        bulanPanel: d.bulanPanel,
        successorName: d.successor || ''
      })
    });
    showToast('\u2705 Panel interview updated!');
  } catch (e) {
    console.error(e);
    showToast('\u274c Failed to save');
  }
}

// --- SAVE CHECKED CANDIDATES TO VACANCY ---
function saveCheckedToVacancy() {
  if (selectedVacancyIdx === null) return showToast('Pilih vacancy terlebih dahulu.');

  const checked = currentEligibleCandidates.filter(k => k._checked);
  if (checked.length === 0) return showToast('Centang kandidat yang ingin disimpan ke Talent List.');

  const vac = vacancyData[selectedVacancyIdx];
  if (!vac) return;

  vac.talentList = checked.map(k => k.name);
  renderDashboard();
  showToast('\u2705 ' + checked.length + ' kandidat disimpan ke Talent List vacancy "' + vac.posisi + '"');

  // Save to Google Sheet
  fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateDashboard',
      rowIndex: vac.rowIndex,
      talentList: vac.talentList.join(', '),
      panelInterview: (vac.panelApproved || []).join(', '),
      successorName: vac.successor || ''
    })
  }).catch(e => console.error(e));
}

// --- SET SUCCESSOR ---
async function setSuccessor(rowIndex, name) {
  const d = findVacancyByRowIndex(rowIndex);
  if (!d) return;
  d.successor = name;

  showToast('\u23f3 Saving successor...');
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateDashboard',
        rowIndex: d.rowIndex,
        successorName: name
      })
    });
    showToast('\u2705 Successor: ' + (name || '(cleared)'));
  } catch (e) {
    showToast('\u274c Failed to save');
  }
}

async function setSuccessorBranch(rowIndex, branch) {
  const d = findVacancyByRowIndex(rowIndex);
  if (!d) return;
  d.successorBranch = branch;
  showToast('\u23f3 Saving successor branch...');
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateDashboard',
        rowIndex: d.rowIndex,
        successorBranch: branch
      })
    });
    showToast('\u2705 Successor Branch: ' + (branch || '(cleared)'));
  } catch (e) {
    showToast('\u274c Failed to save');
  }
}

async function setEffectiveDate(rowIndex, date) {
  const d = findVacancyByRowIndex(rowIndex);
  if (!d) return;
  d.effectiveDate = date;
  showToast('\u23f3 Saving effective date...');
  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'updateDashboard',
        rowIndex: d.rowIndex,
        effectiveDate: date
      })
    });
    showToast('\u2705 Effective Date: ' + (date || '(cleared)'));
  } catch (e) {
    showToast('\u274c Failed to save');
  }
}

// --- RECOMMENDATION RTM ---
let selectedVacancyIdx = null;
let vacancyOptions = [];

function populateVacancyDropdown() {
  vacancyOptions = [];
  vacancyData.forEach((d, i) => {
    if (String(d.status).toUpperCase() === 'OPEN') {
      vacancyOptions.push({ idx: i, label: `${d.posisi} (${d.level}) — ${d.branch}, ${d.region}` });
    }
  });
  renderVacancyDropdownItems(vacancyOptions);
}

function renderVacancyDropdownItems(items) {
  const list = document.getElementById('vacancyDropdownList');
  if (!items.length) {
    list.innerHTML = '<div style="padding:12px 18px;color:#94a3b8;font-size:13px;">Tidak ada vacancy OPEN yang cocok</div>';
    return;
  }
  list.innerHTML = items.map(opt =>
    `<div class="dropdown-item" onmousedown="selectVacancyOption(${opt.idx})" style="padding:12px 18px;cursor:pointer;font-size:14px;font-family:'Plus Jakarta Sans';border-bottom:1px solid #f3f4f6;transition:.15s;white-space:normal;word-break:break-word;">${opt.label}</div>`
  ).join('');
}

function toggleVacancyDropdown(show) {
  const list = document.getElementById('vacancyDropdownList');
  list.style.display = show ? 'block' : 'none';
  if (show) filterVacancyDropdown();
}

function filterVacancyDropdown() {
  const q = document.getElementById('recVacancyInput').value.toLowerCase();
  const filtered = vacancyOptions.filter(opt => opt.label.toLowerCase().includes(q));
  renderVacancyDropdownItems(filtered);
  document.getElementById('vacancyDropdownList').style.display = 'block';
}

function selectVacancyOption(idx) {
  selectedVacancyIdx = idx;
  const d = vacancyData[idx];
  document.getElementById('recVacancyInput').value = `${d.posisi} (${d.level}) — ${d.branch}, ${d.region}`;
  toggleVacancyDropdown(false);
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dd = document.getElementById('vacancyDropdown');
  if (dd && !dd.contains(e.target)) toggleVacancyDropdown(false);
});

function generateRecommendation() {
  if (selectedVacancyIdx === null) return showToast('Pilih vacancy yang valid dari daftar terlebih dahulu.');
  if (HAV_DB.length === 0) return showToast('⏳ Data HAV_Matrix belum selesai dimuat. Tunggu sebentar lalu coba lagi.');

  const vac = vacancyData[selectedVacancyIdx];
  const vacLevel = parseInt(vac.level.replace(/\D/g, '')) || 3;
  const vacLevelStr = 'G' + vacLevel;

  // Department vacancy langsung dari kolom R Dashboard_Vacancy (sync dari Form Response kolom AH)
  const vacDeptRaw = String(vac.department || '').trim();

  // === KEYWORD → DEPARTMENT MAPPING ===
  // Jika nama posisi vacancy mengandung keyword tertentu,
  // kandidat yang ditampilkan difilter ke department yang sesuai.
  // Tambah/edit mapping di sini sesuai kebutuhan.
  const DEPT_KEYWORD_MAP = [
    { keywords: ['logistik', 'logistic'], departments: ['Logistic Delivery', 'Logistic Warehouse'] },
    // Tambah mapping lain di sini, contoh:
    // { keywords: ['sales', 'penjualan'], departments: ['Sales', 'Sales Support'] },
    // { keywords: ['finance', 'keuangan'], departments: ['Finance', 'Accounting'] },
  ];

  // Cek apakah nama posisi vacancy cocok dengan salah satu keyword mapping
  const vacPosLower = (vac.posisi || '').toLowerCase();
  let mappedDepts = []; // array department yang diperbolehkan, kosong = tidak ada mapping aktif
  for (const rule of DEPT_KEYWORD_MAP) {
    if (rule.keywords.some(kw => vacPosLower.includes(kw))) {
      mappedDepts = rule.departments.map(d => d.toLowerCase());
      break;
    }
  }

  // Jika tidak ada keyword match, fallback ke exact match dari vac.department (kolom R)
  // Kalau vac.department juga kosong → tidak ada filter department sama sekali
  const useExactDeptMatch = mappedDepts.length === 0 && vacDeptRaw !== '';

  // Get filter config: try level+dept specific → level-only → defaults
  const cfg = getMasterFilterConfig(vacLevelStr, vacDeptRaw) || getDefaultFilterConfig(vacLevel);
  const targetGrades = cfg.candidateGrades || getTargetGrades(vac.level);
  const maxAge = cfg.maxAge || (vacLevel >= 4 ? 50 : 45);

  // Show vacancy info
  const infoBox = document.getElementById('recVacancyInfo');
  infoBox.classList.remove('hidden');
  const deptFilterLabel = mappedDepts.length > 0
    ? `<em style="color:#7c3aed;font-weight:600">${DEPT_KEYWORD_MAP.find(r => r.keywords.some(kw => vacPosLower.includes(kw)))?.departments.join(', ')}</em> <span style="font-size:11px;color:#9ca3af">(dari keyword posisi)</span>`
    : vacDeptRaw ? `<em>${vacDeptRaw}</em>` : '<em style="color:#9ca3af">—</em>';
  infoBox.innerHTML = `
    <p><strong>Posisi:</strong> ${vac.posisi} (${vac.level})</p>
    <p><strong>Principle:</strong> ${vac.principle || '-'}</p>
    <p><strong>Region:</strong> ${vac.region} | <strong>Branch:</strong> ${vac.branch}</p>
    <p><strong>Department Filter:</strong> ${deptFilterLabel}</p>
    <p><strong>Target Grade Kandidat:</strong> ${targetGrades.join(', ')} | <strong>Max Usia:</strong> ${maxAge} thn</p>
  `;

  // Extract talent names from BOTH talentRec (form) and talentList (RTM) for bypass logic
  const talentNames = [];
  [...(vac.talentRec || []), ...(vac.talentList || [])].forEach(line => {
    line.split(/\d+\.|\n|,|;|\|/).forEach(part => {
      const clean = part.trim().toUpperCase();
      if (clean.length > 2) talentNames.push(clean);
    });
  });

  // Helper: fuzzy match candidate name against talent list
  const isCandidateInTalentList = (kName) => {
    return talentNames.some(tName => {
      if (kName.toUpperCase() === tName) return true;
      const kWords = kName.toUpperCase().split(' ').filter(w => w.length > 2);
      const tWords = tName.split(' ').filter(w => w.length > 2);
      let matchCount = 0;
      tWords.forEach(tw => { if (kWords.includes(tw)) matchCount++; });
      const requiredMatches = Math.min(2, Math.max(1, tWords.length));
      return tWords.length > 0 && matchCount >= requiredMatches;
    });
  };

  const vacPosName = vac.posisi.toLowerCase();

  // Show filter info dynamically from master filter cfg
  const filterDiv = document.getElementById('recFilterInfo');
  const filterDetails = document.getElementById('recFilterDetails');
  filterDiv.classList.remove('hidden');
  filterDetails.innerHTML = `
    <span class="filter-tag pass">Grade: ${targetGrades.join('/')} ✓</span>
    <span class="filter-tag pass">Usia < ${maxAge} thn ✓</span>
    ${(cfg.excludeRating || []).map(r => `<span class="filter-tag fail">Rating ${r} ✗</span>`).join('')}
    ${(cfg.excludeAPM || []).map(a => `<span class="filter-tag fail">APM ${a} ✗</span>`).join('')}
    ${(cfg.excludeSP || []).map(s => `<span class="filter-tag fail">SP ${s} ✗</span>`).join('')}
    ${(cfg.excludeP2K || []).map(p => `<span class="filter-tag fail">P2K: ${p} ✗</span>`).join('')}
    ${(cfg.excludePsikotest || []).map(p => `<span class="filter-tag fail">Psi: ${p} ✗</span>`).join('')}
  `;

  // ---- FILTER CANDIDATES ----
  let eligible = HAV_DB.filter(k => {
    // Usia SELALU dicek — tidak ada bypass termasuk Talent Rec/List
    const candidateAge = Number(k.age);
    if (candidateAge > 0 && candidateAge >= maxAge) return false;

    // Talent Rec/List → bypass semua filter KECUALI usia
    if (isCandidateInTalentList(k.name)) return true;

    // Grade filter
    if (!targetGrades.includes(k.grade)) return false;

    // Department filter — 2 mode:
    // 1. Keyword mapping aktif (mappedDepts tidak kosong): kandidat WAJIB dari salah satu dept yang dimapping
    //    → department kosong/tidak dikenal = ikut dibuang
    // 2. Exact match dari vac.department (useExactDeptMatch): harus sama persis
    // 3. Tidak ada keduanya: tidak ada filter department
    const candDept = String(k.department || '').trim().toLowerCase();
    if (mappedDepts.length > 0) {
      if (!mappedDepts.includes(candDept)) return false; // kosong pun dibuang
    } else if (useExactDeptMatch) {
      if (vacDeptRaw.toLowerCase() !== candDept) return false;
    }

    // APM Level (exclude list)
    const apmStr = String(k.apmLevel).replace(/\s/g, '');
    if ((cfg.excludeAPM || ['<70']).some(excl => apmStr === excl.replace(/\s/g, ''))) return false;

    // Rating
    if ((cfg.excludeRating || ['R3']).includes(k.rating)) return false;

    // CEK SP
    if ((cfg.excludeSP || ['Yes']).includes(k.sp)) return false;

    // CEK P2K
    if ((cfg.excludeP2K || ['Belum Lulus']).includes(k.p2k)) return false;

    // Psikotest
    if ((cfg.excludePsikotest || ['Tidak Disarankan']).includes(k.psiCur)) return false;

    return true;
  });

  // ---- SCORE using Priority Config ----
  const priorityCfg = loadPriorityConfig();
  const N = priorityCfg.order.filter(id => priorityCfg.enabled[id] !== false).length;
  let ptIdx = 0;

  const savedTalentListNames = (vac.talentList || []).map(t => t.toUpperCase().trim());

  eligible.forEach(k => {
    k.score = 0;
    k._isTalentRec = isCandidateInTalentList(k.name);
    // Bersihkan status checked dari vacancy sebelumnya ATAU pre-check jika memang sudah ada di Talent List
    k._checked = savedTalentListNames.some(t => k.name.toUpperCase().trim() === t);


    // Assign exponential points per priority position (so priority 1 always beats all lower combined)
    let enabledIdx = 0;
    priorityCfg.order.forEach(id => {
      if (priorityCfg.enabled[id] === false) return;
      const pts = Math.pow(2, N - enabledIdx); // 2^N, 2^(N-1), ...
      enabledIdx++;
      let applies = false;
      if (id === 'talentRec') applies = isCandidateInTalentList(k.name);
      else if (id === 'starBelum') {
        const isStar = String(k.star).trim() !== '' && String(k.star).trim() !== '-' && String(k.star).trim() !== '0';
        applies = isStar && String(k.promosiStar).toLowerCase().trim() === 'belum promosi';
      }
      else if (id === 'starPromosi') {
        const isStar = String(k.star).trim() !== '' && String(k.star).trim() !== '-' && String(k.star).trim() !== '0';
        const ps = String(k.promosiStar).toLowerCase().trim();
        applies = isStar && ps === 'promosi';
      }
      else if (id === 'principalMatch') applies = !!(vac.principle && k.principal && k.principal.toLowerCase().trim() === vac.principle.toLowerCase().trim());
      else if (id === 'branchMatch') applies = k.branch === vac.branch;
      else if (id === 'regionMatch') applies = k.regional === vac.region;
      if (applies) k.score += pts;
    });

    // Tiebreaker weights
    const apmStr = String(k.apmLevel).replace(/\s/g, '');
    k.apmWeight = apmStr.includes('>90') ? 3 : apmStr.includes('70-90') ? 2 : 1;
    const rt = String(k.rating).toUpperCase().trim();
    k.ratingWeight = rt === 'R1' ? 3 : rt === 'R2' ? 2 : 1;
    const es = String(k.employeeStatus).toLowerCase();
    k.empWeight = (es.includes('permanent') || es.includes('tetap')) ? 3 : es.includes('acting') ? 2 : 1;
    const psi = String(k.psiCur).toLowerCase();
    k.psiWeight = (psi.includes('disarankan') && !psi.includes('tidak')) ? 3 : psi.includes('dipertimbangkan') ? 2 : 1;
  });

  // ---- SORT by score, then tiebreakers in configured order ----
  const tbFieldMap = { rating: 'ratingWeight', empStatus: 'empWeight', ap12m: 'ap12m', psikotest: 'psiWeight', apmLevel: 'apmWeight' };
  const activeTBs = priorityCfg.tiebreakerOrder.filter(id => priorityCfg.tiebreakerEnabled[id] !== false);

  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    for (const tbId of activeTBs) {
      const field = tbFieldMap[tbId];
      if (field && b[field] !== a[field]) return b[field] - a[field];
    }
    return 0;
  });

  window._currentVac = vac; // Store for badge rendering
  currentEligibleCandidates = eligible;
  _recSortState = { col: null, dir: 0 }; // Reset sort when generating new recommendation
  document.getElementById('recSearch').value = ''; // Reset search
  renderRecommendationTable();
}

function renderRecommendationTable() {
  const q = (document.getElementById('recSearch')?.value || '').toLowerCase();
  const resDiv = document.getElementById('recResult');
  const body = document.getElementById('recBody');
  const noRes = document.getElementById('recNoResult');
  const countEl = document.getElementById('recCount');

  // Buat array dengan original rank index preserved — rank TIDAK berubah saat search
  // originalRank = posisi asli di currentEligibleCandidates (0-based → tampil +1)
  let filtered;
  if (q) {
    filtered = currentEligibleCandidates
      .map((k, originalRank) => ({ k, originalRank }))
      .filter(({ k }) => [k.nik, k.name, k.position, k.branch, k.grade].join(' ').toLowerCase().includes(q));
  } else {
    filtered = currentEligibleCandidates.map((k, originalRank) => ({ k, originalRank }));
  }

  // Apply column sort if active
  if (_recSortState.col) {
    filtered = [...filtered].sort((a, b) => {
      let va = a.k[_recSortState.col] ?? '';
      let vb = b.k[_recSortState.col] ?? '';
      if (typeof va === 'number' || typeof vb === 'number') {
        va = Number(va) || 0; vb = Number(vb) || 0;
        return _recSortState.dir === 1 ? va - vb : vb - va;
      }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return _recSortState.dir === 1 ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  resDiv.classList.remove('hidden');
  countEl.textContent = filtered.length + ' candidate(s) found';

  if (filtered.length === 0) {
    body.innerHTML = '';
    noRes.classList.remove('hidden');
  } else {
    noRes.classList.add('hidden');
    let html = '';
    filtered.forEach(({ k, originalRank }, loopIndex) => {
      
      // ✅ FIX UTAMA: Gunakan originalRank agar nomor urut (Rank) tetap mengacu pada posisi asli kandidat
      const actualRank = originalRank; // 0-based index asli (M. Syamsi = 5)
      const displayRank = originalRank + 1; // Rank untuk tampilan (M. Syamsi = 6)
      const isTop5 = actualRank < 5; // Top 5 hanya berlaku untuk rank asli 1-5

      let matchBadge = '';

      // Determine badges from actual data stored during scoring
      const isTalentRec = k._isTalentRec;
      const starVal = String(k.star).trim();
      const isStar = starVal !== '' && starVal !== '-' && starVal !== '0';
      const promosiVal = String(k.promosiStar).toLowerCase().trim();
      const isStarBelum = isStar && promosiVal === 'belum promosi';
      const isStarPromosi = isStar && promosiVal === 'promosi';
      const isPrincipalMatch = !!(window._currentVac?.principle && k.principal && k.principal.toLowerCase().trim() === window._currentVac.principle.toLowerCase().trim());
      const isBranchMatch = k.branch === window._currentVac?.branch;
      const isRegionMatch = k.regional === window._currentVac?.region;
      const vacDeptBadge = String(window._currentVac?.department || '').trim().toLowerCase();
      const isDeptMatch = !!(vacDeptBadge && String(k.department || '').trim().toLowerCase() === vacDeptBadge);

      // Talent Rec badge
      if (isTalentRec) matchBadge += '<span class="match-badge" style="background:#dbeafe;color:#1e40af;margin-right:4px;">🎯 Talent Rec</span>';

      // STAR badges
      if (isStarBelum) matchBadge += '<span class="match-badge match-branch" style="background:#fef08a;color:#854d0e;">🌟 STAR (Belum)</span>';
      else if (isStarPromosi) matchBadge += '<span class="match-badge match-branch" style="background:#fef9c3;color:#a16207;">⭐ STAR (Promosi)</span>';

      // Principal match badge
      if (isPrincipalMatch) matchBadge += ' <span class="match-badge" style="background:#f0fdf4;color:#166534;margin-left:4px">🏢 Principal</span>';

      // Department match badge (hanya tampil jika vacancy punya department)
      if (vacDeptBadge && isDeptMatch) matchBadge += ' <span class="match-badge" style="background:#ede9fe;color:#5b21b6;margin-left:4px">🏷️ Dept Match</span>';

      // Branch & Region badges
      if (isBranchMatch) matchBadge += ' <span class="match-badge match-branch" style="margin-left:4px">📍 Branch</span>';
      if (isRegionMatch && !isBranchMatch) matchBadge += ' <span class="match-badge match-region" style="margin-left:4px">🗺️ Region</span>';

      // Fallback
      if (matchBadge === '') matchBadge = '<span class="match-badge match-other">Eligible</span>';

      // Stylings & Badges berdasarkan Rank Asli (actualRank)
      const rankClass = actualRank === 0 ? 'rank-1' : actualRank === 1 ? 'rank-2' : actualRank === 2 ? 'rank-3' : actualRank === 3 ? 'rank-4' : actualRank === 4 ? 'rank-5' : '';
      const ap12mFormatted = Number(k.ap12m).toFixed(2);

      // Format phone to wa.me link
      let phoneLink = '-';
      if (k.phone) {
        let raw = String(k.phone).replace(/[^\d]/g, '');
        if (raw.startsWith('0')) raw = '62' + raw.substring(1);
        else if (raw.startsWith('8')) raw = '62' + raw;
        if (raw.length >= 10) {
          phoneLink = `<a href="https://wa.me/${raw}" target="_blank" style="color:var(--primary);text-decoration:none;font-weight:600;font-size:12px;">📱 ${raw}</a>`;
        }
      }

      // Format employee status badge
      let empBadge = k.employeeStatus || '-';
      const esLow = String(k.employeeStatus).toLowerCase();
      if (esLow.includes('permanent') || esLow.includes('tetap')) empBadge = '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Permanent</span>';
      else if (esLow.includes('acting')) empBadge = '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Acting</span>';
      else if (esLow.includes('contract') || esLow.includes('kontrak')) empBadge = '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Contract</span>';

      const isChecked = k._checked ? 'checked' : '';

      // Top-5 rank crown emoji — hanya untuk rank asli 1-5
      const crownMap = { 0: '🥇', 1: '🥈', 2: '🥉', 3: '4️⃣', 4: '5️⃣' };
      const rankLabel = isTop5 ? `<span title="Rank #${displayRank}" style="margin-left:3px;font-size:10px;">${crownMap[actualRank] || ''}</span>` : '';

      // Keinginan Promosi
      const keinginanRaw = String(k.keinginanPromosi || '').trim();
      let keinginanCell = '<span style="color:#94a3b8;font-size:11px;font-style:italic">-</span>';
      if (keinginanRaw) {
        const kLow = keinginanRaw.toLowerCase();
        let kBg, kColor;
        if (kLow === 'tidak bersedia' || kLow.startsWith('tidak')) {
          kBg = '#fee2e2'; kColor = '#991b1b';
        } else if (kLow === 'bersedia' || (!kLow.startsWith('tidak') && kLow.includes('bersedia'))) {
          kBg = '#dcfce7'; kColor = '#166534';
        } else {
          kBg = '#f3f4f6'; kColor = '#374151';
        }
        keinginanCell = `<span style="display:inline-block;background:${kBg};color:${kColor};padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;">${keinginanRaw}</span>`;
      }

      // Kesediaan Penempatan
      const kesediaanRaw = String(k.kesediaanPenempatan || '').trim();
      const kesediaanCell = kesediaanRaw
        ? `<span style="font-size:11px;color:#374151;">${kesediaanRaw}</span>`
        : '<span style="color:#94a3b8;font-size:11px;font-style:italic">-</span>';

      html += `<tr class="${isTop5 ? 'rec-top-row ' + rankClass : ''}">
        <td style="text-align:center"><input type="checkbox" class="rec-check" data-nik="${k.nik}" ${isChecked} onchange="toggleRecCheckByNik('${k.nik}',this.checked)"></td>
        
        <!-- ✅ MENAMPILKAN RANK ASLI CANDIDATE -->
        <td><span class="row-num">${displayRank}</span>${rankLabel}</td>
        
        <td style="font-weight:600;font-size:12px;">${k.nik}</td>
        <td style="font-weight:${isTop5 ? '700' : '500'}">${k.name}</td>
        <td style="text-align:center">${k.age || '-'}</td>
        <td style="font-size:12px;">${k.education || '-'}</td>
        <td>${empBadge}</td>
        <td style="font-size:12px;">${k.position}</td>
        <td><span style="background:#eef2ff;color:var(--primary-dark);padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px">${k.grade}</span></td>
        <td style="font-size:12px;">${k.principal || '-'}</td>
        <td style="font-size:12px;">${k.regional || '-'}</td>
        <td style="font-weight:600;font-size:12px;">${k.branch}</td>
        <td style="font-size:12px;">${k.department || '-'}</td>
        <td>${phoneLink}</td>
        <td><span style="font-weight:700;${k.rating === 'R1' ? 'color:#065f46;' : k.rating === 'R2' ? 'color:#1e40af;' : 'color:#6b7280;'}">${k.rating}</span></td>
        <td style="text-align:center;font-weight:600;">${ap12mFormatted}</td>
        <td><span style="font-size:12px;font-weight:600;${String(k.psiCur || '').toLowerCase().includes('tidak disarankan') ? 'color:#991b1b;background:#fee2e2;padding:2px 8px;border-radius:4px;display:inline-block;' : ''}">${k.psiCur || '-'}</span></td>
        <td style="font-weight:700;color:var(--primary-dark)">${k.havProyeksi || '-'}</td>
        <td><span style="color:${k.p2k === 'Lulus' ? 'var(--success)' : 'var(--danger)'};font-weight:700">${k.p2k}</span></td>
        <td style="font-size:12px;text-align:center;">${k.lengthOfService || '-'}</td>
        <td>${keinginanCell}</td>
        <td>${kesediaanCell}</td>
        <td>${matchBadge}</td>
      </tr>`;
    });
    body.innerHTML = html;
  }
}


// --- TOAST ---
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- CHECKBOX FUNCTIONS ---
function toggleRecCheckByNik(nik, checked) {
  const candidate = currentEligibleCandidates.find(k => String(k.nik) === String(nik));
  if (candidate) candidate._checked = checked;
}
function toggleRecCheck(idx, checked) {
  // Legacy fallback — pakai originalRank index
  if (currentEligibleCandidates[idx]) currentEligibleCandidates[idx]._checked = checked;
}
function toggleAllRecChecks(checked) {
  currentEligibleCandidates.forEach(k => k._checked = checked);
  document.querySelectorAll('.rec-check').forEach(cb => cb.checked = checked);
}
function getFilteredCandidates() {
  const q = (document.getElementById('recSearch')?.value || '').toLowerCase();
  if (!q) return currentEligibleCandidates;
  return currentEligibleCandidates.filter(k =>
    [k.nik, k.name, k.position, k.branch, k.grade].join(' ').toLowerCase().includes(q)
  );
}


// --- DOWNLOAD REC EXCEL ---
function downloadRecExcel() {
  const filtered = getFilteredCandidates();
  const checked = filtered.filter(k => k._checked);
  const data = checked.length > 0 ? checked : filtered;

  const headers = ['No', 'NIK', 'Nama', 'Usia', 'Education', 'Employee Status', 'Position', 'Job Grade', 'Principal', 'Region', 'Branch', 'WhatsApp', 'PA Level', 'AP12M', 'Psikotest', 'HAV (Proyeksi)', 'P2K', 'Match Priority'];
  let csv = headers.join(',') + '\n';
  data.forEach((k, i) => {
    let phone = '';
    if (k.phone) {
      let raw = String(k.phone).replace(/[^\d]/g, '');
      if (raw.startsWith('0')) raw = '62' + raw.substring(1);
      else if (raw.startsWith('8')) raw = '62' + raw;
      phone = raw;
    }
    const row = [
      i + 1, k.nik,
      '"' + (k.name || '').replace(/"/g, '""') + '"',
      k.age || '', '"' + (k.education || '') + '"', '"' + (k.employeeStatus || '') + '"',
      '"' + (k.position || '') + '"', k.grade, '"' + (k.principal || '') + '"',
      '"' + (k.regional || '') + '"', '"' + (k.branch || '') + '"',
      phone, k.rating, Number(k.ap12m).toFixed(2),
      '"' + (k.psiCur || '') + '"', '"' + (k.havProyeksi || '') + '"',
      k.p2k, '"' + (k.score >= 1000 ? 'Talent Rec' : k.score > 0 ? 'Priority' : 'Eligible') + '"'
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const vacName = window._currentVac ? window._currentVac.posisi.replace(/[^a-zA-Z0-9]/g, '_') : 'Candidates';
  a.download = 'Rec_' + vacName + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('\u2705 ' + (checked.length > 0 ? checked.length + ' selected candidates' : 'All candidates') + ' downloaded!');
}

// --- DOWNLOAD DASHBOARD EXCEL (.XLSX) ---
function downloadDashboardExcel() {
  const statusFilter = document.getElementById('dashStatusFilter')?.value || 'ALL';
  const q = (document.getElementById('dashSearch')?.value || '').toLowerCase();
  const dateStart = document.getElementById('dashDateStart')?.value;
  const dateEnd = document.getElementById('dashDateEnd')?.value;

  let rows = vacancyData.filter(d => {
    // 1. Filter Tanggal
    if (dateStart || dateEnd) {
      if (d.timestamp) {
        const ts = new Date(d.timestamp).toISOString().slice(0, 10);
        if (dateStart && ts < dateStart) return false;
        if (dateEnd && ts > dateEnd) return false;
      }
    }

    // 2. Filter Status
    if (statusFilter === 'OPEN' && d.status !== 'Open') return false;
    if (statusFilter === 'HOLD' && d.status !== 'Hold') return false;
    if (statusFilter === 'CLOSED' && d.status !== 'Closed' && d.status !== 'Cancel') return false;

    // 3. Filter Pencarian Text
    if (q) {
      const searchStr = [
        d.pemohon, 
        d.posisi, 
        d.region, 
        d.branch, 
        d.department,
        ...(d.talentList || []),
        ...(d.talentRec || [])
      ].join(' ').toLowerCase();
      if (!searchStr.includes(q)) return false;
    }
    return true;
  });

  if (rows.length === 0) {
    showToast('⚠️ Tidak ada data untuk di-download');
    return;
  }

  // Helper untuk membersihkan teks nama dari array / string
  const cleanText = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) {
      return val
        .map(v => (typeof v === 'object' && v !== null ? (v.name || v.text || JSON.stringify(v)) : String(v)))
        .filter(Boolean)
        .join('; ');
    }
    if (typeof val === 'object' && val !== null) {
      return val.name || val.text || JSON.stringify(val);
    }
    return String(val);
  };

  // Buat array of objects untuk sheet Excel (URUTAN SESUAI TABEL WEB)
  const excelData = rows.map((d, i) => {
    // Format Tanggal Request (Sama seperti renderDashboard)
    let reqDateFormatted = '-';
    if (d.timestamp) {
      const dt = new Date(d.timestamp);
      reqDateFormatted = !isNaN(dt.getTime()) 
        ? dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) 
        : d.timestamp;
    } else if (d.requestDate) {
      reqDateFormatted = d.requestDate;
    }

    // 1. KELOLA TALENT REC
    let talentRecStr = cleanText(d.talentRec || d.talentRecs);
    if (!talentRecStr && d.rawTalentRec) talentRecStr = cleanText(d.rawTalentRec);

    // 2. KELOLA TALENT LIST
    let talentListStr = cleanText(d.talentList || d.talents);
    if (typeof talentListStr === 'string' && talentListStr.length > 0) {
      talentListStr = talentListStr
        .replace(/^\d+\.\s*/, '')
        .split(/[\r\n|,;]+|\s*\d+\.\s*/)
        .map(s => s.trim())
        .filter(Boolean)
        .join('; ');
    }

    // 3. Panel Interview & Successor
    const panelStr = cleanText(d.panelApproved || d.panelInterview);
    const successorStr = cleanText(d.successor || d.successorName);

    // 4. Notes
    let notesStr = '';
    if (typeof d.notes === 'string') {
      notesStr = d.notes;
    } else if (Array.isArray(d.notes)) {
      notesStr = d.notes.map(n => (n.date ? n.date + ' - ' : '') + (n.text || n)).join(' | ');
    } else {
      notesStr = cleanText(d.notes);
    }

    // Mapping header ke isi kolom (Disesuaikan Presisi Urutannya dengan Header Website)
    return {
      'NO': i + 1,
      'REQUEST DATE': reqDateFormatted,  // 👈 Diletakkan di Kolom Ke-2
      'REQUESTOR': d.pemohon || '',
      'VACANT POSITION': d.posisi || '',
      'LEVEL': d.level || '',
      'REGION': d.region || '',
      'BRANCH': d.branch || '',
      'WORK LOCATION': d.workLoc || '',
      'PRINCIPLE': d.principle || '',
      'REASON': d.reason || '',
      'DEPARTMENT': d.department || '',
      'TALENT REC': talentRecStr,
      'TALENT LIST': talentListStr,
      'MANPOWER': d.manpower || 1,
      'PANEL INTERVIEW': panelStr,
      'SUCCESSOR': successorStr,
      'SUCCESSOR BRANCH': cleanText(d.successorBranch),
      'EFFECTIVE DATE': cleanText(d.effectiveDate),
      'BULAN PANEL': d.bulanPanel || '',
      'SOURCE': d.source || '',
      'STATUS': d.status || 'Open',
      'NOTE': notesStr
    };
  });

  // --- PROSES EXPORT XLSX DENGAN SHEETJS ---
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dashboard Vacancy");

  // Auto-width kolom agar tampilan rapi saat dibuka di Excel
  const columnWidths = Object.keys(excelData[0] || {}).map(key => ({
    wch: Math.max(key.length + 3, 12)
  }));
  worksheet['!cols'] = columnWidths;

  // Simpan/Download file .xlsx
  const fileName = 'Dashboard_Vacancy_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  XLSX.writeFile(workbook, fileName);

  showToast('✅ File Excel (.xlsx) berhasil di-download!');
}

// ==========================================================
// --- MASTER FILTER (v2: per-vacancy-level, dynamic from HAV_DB) ---
// ==========================================================

function getMasterFilters() {
  try { return JSON.parse(localStorage.getItem('masterFiltersV2') || '{}'); } catch (e) { return {}; }
}

// Default config based on vacancy level number
function getDefaultFilterConfig(vacLevelNum) {
  const n = parseInt(vacLevelNum) || 3;
  const grades = [];
  if (n - 1 >= 1) grades.push('G' + (n - 1));
  if (n - 2 >= 1) grades.push('G' + (n - 2));
  return {
    candidateGrades: grades.length ? grades : ['G1', 'G2'],
    maxAge: n >= 4 ? 50 : 45,
    excludeRating: ['R3'],
    excludeAPM: ['<70'],
    excludeP2K: ['Belum Lulus'],
    excludePsikotest: ['Tidak Disarankan'],
    excludeSP: ['Yes']
  };
}

// Get config for a specific vacancy level + optional department
// Lookup order: "G3::Sales" → "G3" → null (use defaults)
function getMasterFilterConfig(vacLevelStr, dept) {
  const filters = getMasterFilters();
  if (dept) {
    const specific = filters[vacLevelStr + '::' + dept];
    if (specific) return specific;
  }
  return filters[vacLevelStr] || null;
}

// Extract unique non-empty values from HAV_DB for a given field key
function getUniqueHAVValues(field) {
  const vals = [...new Set(HAV_DB.map(k => String(k[field] || '').trim()).filter(v => v && v !== 'undefined' && v !== ''))];
  return vals.sort();
}


function renderMasterFilter() {
  const levelSelect = document.getElementById('mfLevelSelect');
  const deptSelect = document.getElementById('mfDeptSelect');
  if (!levelSelect) return;
  const level = levelSelect.value;
  const dept = deptSelect?.value || '';
  const content = document.getElementById('mfContent');
  if (!level) { content.classList.add('hidden'); return; }

  // Populate department dropdown dynamically from HAV_DB
  if (deptSelect && deptSelect.options.length <= 1) {
    const depts = getUniqueHAVValues('department');
    depts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      deptSelect.appendChild(opt);
    });
  }

  content.classList.remove('hidden');
  const labelParts = [level];
  if (dept) labelParts.push(dept);
  document.getElementById('mfLevelName').textContent = labelParts.join(' — ');

  const filters = getMasterFilters();
  const levelNum = parseInt(level.replace(/\D/g, '')) || 3;
  const storageKey = dept ? level + '::' + dept : level;
  const cfg = filters[storageKey] || getDefaultFilterConfig(levelNum);

  // Helper: render checkbox list for a filter section
  function renderCheckboxes(containerId, cssClass, values, selectedValues, colorSet) {
    const div = document.getElementById(containerId);
    if (!div) return;
    const bg = colorSet === 'include' ? '#f0fdf4' : '#fff5f5';
    const border = colorSet === 'include' ? '#bbf7d0' : '#fecaca';
    div.innerHTML = values.map(v => {
      const checked = (selectedValues || []).includes(v) ? 'checked' : '';
      return `<label style="display:flex;align-items:center;gap:5px;padding:5px 10px;background:${bg};border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;border:1px solid ${border};">
        <input type="checkbox" class="${cssClass}" value="${v}" ${checked}> ${v}
      </label>`;
    }).join('');
  }

  // Candidate Grades (INCLUDE)
  const allGrades = HAV_DB.length > 0 ? getUniqueHAVValues('grade') : ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
  renderCheckboxes('mfCandidateGrades', 'mf-grade', allGrades, cfg.candidateGrades, 'include');

  // Max Age
  document.getElementById('mfMaxAge').value = cfg.maxAge || 45;

  // Rating PA (EXCLUDE)
  const allRatings = HAV_DB.length > 0 ? getUniqueHAVValues('rating') : ['R1', 'R2', 'R3', 'NR'];
  renderCheckboxes('mfExcludeRating', 'mf-excl-rating', allRatings, cfg.excludeRating, 'exclude');

  // APM Level (EXCLUDE)
  const allAPM = HAV_DB.length > 0 ? getUniqueHAVValues('apmLevel') : ['<70', '70-90', '>90'];
  renderCheckboxes('mfExcludeAPM', 'mf-excl-apm', allAPM, cfg.excludeAPM, 'exclude');

  // P2K (EXCLUDE)
  const allP2K = HAV_DB.length > 0 ? getUniqueHAVValues('p2k') : ['Lulus', 'Belum Lulus'];
  renderCheckboxes('mfExcludeP2K', 'mf-excl-p2k', allP2K, cfg.excludeP2K, 'exclude');

  // Psikotest (EXCLUDE)
  const allPsi = HAV_DB.length > 0 ? getUniqueHAVValues('psiCur') : ['Disarankan', 'Dipertimbangkan', 'Tidak Disarankan'];
  renderCheckboxes('mfExcludePsi', 'mf-excl-psi', allPsi, cfg.excludePsikotest, 'exclude');

  // CEK SP (EXCLUDE)
  // 1. Ambil data mentah dari database/array
  const rawSP = HAV_DB.length > 0 ? getUniqueHAVValues('sp') : ['Yes', 'No'];

  // 2. Format tanggal menjadi "DD MMMM YYYY" (misal: 04 September 2023)
  const allSP = rawSP.map(val => {
    // Cek apakah nilai berupa string tanggal ISO yang valid
    const timestamp = Date.parse(val);
    if (!isNaN(timestamp) && val !== 'Yes' && val !== 'No') {
      const dateObj = new Date(val);
      return dateObj.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long', // Mengubah angka bulan menjadi teks (misal: "September")
        year: 'numeric'
      });
    }
    return val; // Jika berupa 'Yes', 'No', atau string biasa, biarkan tetap
  });

  // 3. Render checkbox dengan tanggal yang sudah diformat
  renderCheckboxes('mfExcludeSP', 'mf-excl-sp', allSP, cfg.excludeSP, 'exclude');
}

function saveMasterFilter() {
  const level = document.getElementById('mfLevelSelect').value;
  if (!level) return showToast('Pilih vacancy level terlebih dahulu.');
  const dept = document.getElementById('mfDeptSelect')?.value || '';
  const storageKey = dept ? level + '::' + dept : level;

  const filters = getMasterFilters();
  filters[storageKey] = {
    candidateGrades: Array.from(document.querySelectorAll('.mf-grade:checked')).map(cb => cb.value),
    maxAge: parseInt(document.getElementById('mfMaxAge').value) || 45,
    excludeRating: Array.from(document.querySelectorAll('.mf-excl-rating:checked')).map(cb => cb.value),
    excludeAPM: Array.from(document.querySelectorAll('.mf-excl-apm:checked')).map(cb => cb.value),
    excludeP2K: Array.from(document.querySelectorAll('.mf-excl-p2k:checked')).map(cb => cb.value),
    excludePsikotest: Array.from(document.querySelectorAll('.mf-excl-psi:checked')).map(cb => cb.value),
    excludeSP: Array.from(document.querySelectorAll('.mf-excl-sp:checked')).map(cb => cb.value),
  };
  localStorage.setItem('masterFiltersV2', JSON.stringify(filters));
  const label = dept ? level + ' — ' + dept : level + ' (All Department)';
  showToast('\u2705 Filter untuk ' + label + ' tersimpan!');
}

// ==========================================================
// --- PRIORITY CONFIG (drag-reorder, enable/disable) ---
// ==========================================================

const PRIORITY_DEFINITIONS = [
  { id: 'talentRec', label: 'Talent Recommendation', emoji: '\uD83C\uDFAF', bg: '#dbeafe', color: '#1e40af', desc: 'Kandidat dari Talent Rec vacancy (ajuan pemohon)' },
  { id: 'starBelum', label: 'STAR (Belum Promosi)', emoji: '\uD83C\uDF1F', bg: '#fef08a', color: '#854d0e', desc: 'Kandidat STAR yang belum pernah dipromosikan' },
  { id: 'starPromosi', label: 'STAR (Promosi)', emoji: '\u2B50', bg: '#fef9c3', color: '#a16207', desc: 'Kandidat STAR yang sudah pernah dipromosikan' },
  { id: 'principalMatch', label: 'Principal Match', emoji: '\uD83C\uDFE2', bg: '#f0fdf4', color: '#166534', desc: 'Principal kandidat sama dengan vacancy' },
  { id: 'branchMatch', label: 'Branch Match', emoji: '\uD83D\uDCCD', bg: '#eff6ff', color: '#1e40af', desc: 'Kandidat dari cabang yang sama' },
  { id: 'regionMatch', label: 'Region Match', emoji: '\uD83D\uDDFA\uFE0F', bg: '#f9fafb', color: '#475569', desc: 'Kandidat dari region yang sama' },
];

const TIEBREAKER_DEFINITIONS = [
  { id: 'rating', label: 'PA Level', desc: 'R1 > R2 > NR', field: 'ratingWeight' },
  { id: 'empStatus', label: 'Employee Status', desc: 'Permanent > Acting > Contract', field: 'empWeight' },
  { id: 'ap12m', label: 'AP12M', desc: 'Nilai tertinggi', field: 'ap12m' },
  { id: 'psikotest', label: 'Psikotest', desc: 'Disarankan > Dipertimbangkan', field: 'psiWeight' },
  { id: 'apmLevel', label: 'APM Level', desc: '>90 > 70-90', field: 'apmWeight' },
];

function loadPriorityConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('priorityConfig') || '{}');
    const defaultOrder = PRIORITY_DEFINITIONS.map(p => p.id);
    const defaultEnabled = Object.fromEntries(PRIORITY_DEFINITIONS.map(p => [p.id, true]));
    const defaultTBOrder = TIEBREAKER_DEFINITIONS.map(t => t.id);
    const defaultTBEnabled = Object.fromEntries(TIEBREAKER_DEFINITIONS.map(t => [t.id, true]));
    return {
      order: saved.order || defaultOrder,
      enabled: { ...defaultEnabled, ...(saved.enabled || {}) },
      tiebreakerOrder: saved.tiebreakerOrder || defaultTBOrder,
      tiebreakerEnabled: { ...defaultTBEnabled, ...(saved.tiebreakerEnabled || {}) },
    };
  } catch (e) {
    return {
      order: PRIORITY_DEFINITIONS.map(p => p.id),
      enabled: Object.fromEntries(PRIORITY_DEFINITIONS.map(p => [p.id, true])),
      tiebreakerOrder: TIEBREAKER_DEFINITIONS.map(t => t.id),
      tiebreakerEnabled: Object.fromEntries(TIEBREAKER_DEFINITIONS.map(t => [t.id, true])),
    };
  }
}

function savePriorityConfig(cfg) {
  localStorage.setItem('priorityConfig', JSON.stringify(cfg));
}

let _priDragFrom = null;

function renderPriorityEditor() {
  const cfg = loadPriorityConfig();

  // Render main priority list
  const container = document.getElementById('priorityEditorList');
  if (!container) return;

  const ordered = cfg.order
    .map(id => PRIORITY_DEFINITIONS.find(p => p.id === id))
    .filter(Boolean);
  // Append any new items not yet in saved order
  PRIORITY_DEFINITIONS.forEach(p => { if (!cfg.order.includes(p.id)) ordered.push(p); });

  container.innerHTML = ordered.map((item, idx) => {
    const on = cfg.enabled[item.id] !== false;
    return `<div class="priority-row" draggable="true"
        ondragstart="_priDragFrom=${idx}"
        ondragover="event.preventDefault()"
        ondrop="onPriDrop(event,${idx})"
        style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${on ? item.bg : '#f3f4f6'};border-radius:8px;margin-bottom:6px;border:1px solid ${on ? 'rgba(0,0,0,.07)' : '#e5e7eb'};opacity:${on ? '1' : '0.5'};cursor:grab;transition:.15s;">
      <span style="cursor:grab;color:#94a3b8;font-size:18px;line-height:1;user-select:none;">⠿</span>
      <span style="font-weight:800;color:${on ? item.color : '#94a3b8'};width:22px;font-size:13px;">${idx + 1}.</span>
      <span style="font-size:18px;">${item.emoji}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;color:${on ? item.color : '#94a3b8'}">${item.label}</div>
        <div style="font-size:11px;color:#64748b;margin-top:1px;">${item.desc}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
        <button onclick="movePriority(${idx},-1)" style="width:26px;height:26px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;cursor:pointer;font-size:11px;" ${idx === 0 ? 'disabled' : ''}>\u25B2</button>
        <button onclick="movePriority(${idx},1)" style="width:26px;height:26px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;cursor:pointer;font-size:11px;" ${idx === ordered.length - 1 ? 'disabled' : ''}>\u25BC</button>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:6px;white-space:nowrap;">
          <input type="checkbox" ${on ? 'checked' : ''} onchange="togglePriority('${item.id}',this.checked)" style="width:14px;height:14px;cursor:pointer;">
          <span style="font-size:11px;color:#64748b;font-weight:600;">Aktif</span>
        </label>
      </div>
    </div>`;
  }).join('');

  // Render tiebreaker list
  const tbContainer = document.getElementById('tiebreakerEditorList');
  if (!tbContainer) return;
  const orderedTB = cfg.tiebreakerOrder
    .map(id => TIEBREAKER_DEFINITIONS.find(t => t.id === id))
    .filter(Boolean);
  TIEBREAKER_DEFINITIONS.forEach(t => { if (!cfg.tiebreakerOrder.includes(t.id)) orderedTB.push(t); });

  tbContainer.innerHTML = orderedTB.map((item, idx) => {
    const on = cfg.tiebreakerEnabled[item.id] !== false;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f9fafb;border-radius:8px;margin-bottom:4px;border:1px solid #e5e7eb;opacity:${on ? '1' : '0.5'};">
      <span style="color:#94a3b8;font-size:16px;user-select:none;">⠿</span>
      <span style="font-weight:700;color:#475569;width:20px;font-size:12px;">${idx + 1}.</span>
      <div style="flex:1;">
        <span style="font-weight:700;font-size:13px;">${item.label}</span>
        <span style="font-size:11px;color:#64748b;margin-left:8px;">${item.desc}</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button onclick="moveTiebreaker(${idx},-1)" style="width:24px;height:24px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;cursor:pointer;font-size:10px;" ${idx === 0 ? 'disabled' : ''}>\u25B2</button>
        <button onclick="moveTiebreaker(${idx},1)" style="width:24px;height:24px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;cursor:pointer;font-size:10px;" ${idx === orderedTB.length - 1 ? 'disabled' : ''}>\u25BC</button>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:6px;white-space:nowrap;">
          <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleTiebreaker('${item.id}',this.checked)" style="width:14px;height:14px;cursor:pointer;">
          <span style="font-size:11px;color:#64748b;font-weight:600;">Aktif</span>
        </label>
      </div>
    </div>`;
  }).join('');
}

function onPriDrop(event, toIdx) {
  event.preventDefault();
  if (_priDragFrom === null || _priDragFrom === toIdx) return;
  const cfg = loadPriorityConfig();
  const arr = [...cfg.order];
  const [moved] = arr.splice(_priDragFrom, 1);
  arr.splice(toIdx, 0, moved);
  cfg.order = arr;
  savePriorityConfig(cfg);
  _priDragFrom = null;
  renderPriorityEditor();
  showToast('\u2705 Urutan priority diperbarui!');
}

function movePriority(fromIdx, dir) {
  const cfg = loadPriorityConfig();
  const toIdx = fromIdx + dir;
  if (toIdx < 0 || toIdx >= cfg.order.length) return;
  const arr = [...cfg.order];
  [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
  cfg.order = arr;
  savePriorityConfig(cfg);
  renderPriorityEditor();
  showToast('\u2705 Urutan priority disimpan!');
}

function togglePriority(id, enabled) {
  const cfg = loadPriorityConfig();
  cfg.enabled[id] = enabled;
  savePriorityConfig(cfg);
  renderPriorityEditor();
}

function moveTiebreaker(fromIdx, dir) {
  const cfg = loadPriorityConfig();
  const toIdx = fromIdx + dir;
  if (toIdx < 0 || toIdx >= cfg.tiebreakerOrder.length) return;
  const arr = [...cfg.tiebreakerOrder];
  [arr[fromIdx], arr[toIdx]] = [arr[toIdx], arr[fromIdx]];
  cfg.tiebreakerOrder = arr;
  savePriorityConfig(cfg);
  renderPriorityEditor();
  showToast('\u2705 Urutan tiebreaker disimpan!');
}

function toggleTiebreaker(id, enabled) {
  const cfg = loadPriorityConfig();
  cfg.tiebreakerEnabled[id] = enabled;
  savePriorityConfig(cfg);
  renderPriorityEditor();
}

// ==========================================================
// --- TALENT SEARCH ---
// ==========================================================
let _tsResults = [];
let _tsSortState = { col: null, dir: 0 };
let _recSortState = { col: null, dir: 0 };
let _msSelected = { grade: [], department: [], region: [], principal: [] };
let _tsFiltersInitialized = false;

function initTSFilters() {
  if (_tsFiltersInitialized && HAV_DB.length > 0) return;
  if (HAV_DB.length === 0) {
    showToast('⏳ Menunggu data HAV...');
    const wi = setInterval(() => {
      if (HAV_DB.length > 0) { clearInterval(wi); _populateMSFilters(); }
    }, 500);
    return;
  }
  _populateMSFilters();
}

function _populateMSFilters() {
  const fieldMap = { grade: 'grade', department: 'department', region: 'regional', principal: 'principal' };
  Object.entries(fieldMap).forEach(([key, havField]) => {
    const vals = getUniqueHAVValues(havField);
    const container = document.getElementById('msOpts_' + key);
    if (!container) return;
    container.innerHTML = vals.map(v =>
      `<label class="ms-opt-item"><input type="checkbox" value="${v}" onchange="onMSChange('${key}')"> ${v}</label>`
    ).join('');
  });
  _tsFiltersInitialized = true;
}

function toggleMS(id) {
  const dd = document.getElementById('msDD_' + id);
  if (!dd) return;
  const isHidden = dd.classList.contains('hidden');
  // Close all dropdowns first
  document.querySelectorAll('.ms-dd').forEach(d => d.classList.add('hidden'));
  if (isHidden) dd.classList.remove('hidden');
}

// Close multi-select dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ms-wrap')) {
    document.querySelectorAll('.ms-dd').forEach(d => d.classList.add('hidden'));
  }
});

function onMSChange(key) {
  const container = document.getElementById('msOpts_' + key);
  const checked = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
  _msSelected[key] = checked;
  const txt = document.getElementById('msTxt_' + key);
  if (checked.length === 0) {
    txt.innerHTML = 'Semua';
  } else {
    txt.innerHTML = checked.length + ' dipilih <span class="ms-count">' + checked.length + '</span>';
  }
}

function filterMSOpts(key, q) {
  const container = document.getElementById('msOpts_' + key);
  const items = container.querySelectorAll('.ms-opt-item');
  const ql = q.toLowerCase();
  items.forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(ql) ? '' : 'none';
  });
}

function filterTalentSearch() {
  const { grade, department, region, principal } = _msSelected;

  // If no filters selected, show all
  _tsResults = HAV_DB.filter(k => {
    if (grade.length > 0 && !grade.includes(k.grade)) return false;
    if (department.length > 0 && !department.includes(k.department)) return false;
    if (region.length > 0 && !region.includes(k.regional)) return false;
    if (principal.length > 0 && !principal.includes(k.principal)) return false;
    return true;
  });

  // Sort _tsResults by a default "Quality Score" so that Rank 1-5 are actually top talents
  // Penalize bad psikotest, SP, and unpassed P2K so they drop to the bottom.
  _tsResults.sort((a, b) => {
    const getScore = (k) => {
      let s = Number(k.ap12m) || 0;
      if (k.rating === 'R1') s += 30;
      else if (k.rating === 'R2') s += 20;
      else if (k.rating === 'R3') s += 10;
      
      const psi = String(k.psiCur).toLowerCase().trim();
      if (psi.includes('tidak disarankan')) s -= 200;
      if (String(k.p2k).toLowerCase().trim() === 'belum lulus') s -= 200;
      if (String(k.sp).toLowerCase().trim() === 'yes') s -= 200;
      return s;
    };
    return getScore(b) - getScore(a);
  });

  // Reset state
  _tsResults.forEach((k, idx) => { k._tsChecked = false; k._tsOriginalIndex = idx; });
  _tsSortState = { col: null, dir: 0 };
  document.getElementById('tsResult').classList.remove('hidden');
  document.getElementById('tsSearch').value = '';
  renderTSTable();
  showToast('✅ ' + _tsResults.length + ' kandidat ditemukan');
}

function resetTSFilters() {
  _msSelected = { grade: [], department: [], region: [], principal: [] };
  document.querySelectorAll('.ms-opts input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  ['grade', 'department', 'region', 'principal'].forEach(key => {
    const txt = document.getElementById('msTxt_' + key);
    if (txt) txt.innerHTML = 'Semua';
  });
  document.getElementById('tsResult').classList.add('hidden');
  _tsResults = [];
  showToast('🔄 Filter direset');
}

function renderTSTable() {
  const q = (document.getElementById('tsSearch')?.value || '').toLowerCase();
  const body = document.getElementById('tsBody');
  const noRes = document.getElementById('tsNoResult');
  const countEl = document.getElementById('tsCount');

  let filtered = _tsResults;
  if (q) {
    filtered = _tsResults.filter(k =>
      [k.nik, k.name, k.position, k.branch, k.grade, k.department, k.principal].join(' ').toLowerCase().includes(q)
    );
  }

  // Apply sort
  if (_tsSortState.col) {
    filtered = [...filtered].sort((a, b) => {
      let va = a[_tsSortState.col] ?? '';
      let vb = b[_tsSortState.col] ?? '';
      if (typeof va === 'number' || typeof vb === 'number') {
        va = Number(va) || 0; vb = Number(vb) || 0;
        return _tsSortState.dir === 1 ? va - vb : vb - va;
      }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return _tsSortState.dir === 1 ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  countEl.textContent = filtered.length + ' candidate(s) found';

  if (filtered.length === 0) {
    body.innerHTML = '';
    noRes.classList.remove('hidden');
    return;
  }

  noRes.classList.add('hidden');
  const { grade, department, region, principal } = _msSelected;

  let html = '';
  filtered.forEach((k, i) => {
    // Match priority badges based on selected filters
    let matchBadge = '';
    if (region.length > 0 && region.includes(k.regional))
      matchBadge += '<span class="match-badge match-region" style="margin-right:3px">📍 Region</span>';
    if (principal.length > 0 && principal.includes(k.principal))
      matchBadge += '<span class="match-badge" style="background:#f0fdf4;color:#166534;margin-right:3px">🏢 Principal</span>';
    if (department.length > 0 && department.includes(k.department))
      matchBadge += '<span class="match-badge" style="background:#ede9fe;color:#5b21b6;margin-right:3px">🏷️ Dept</span>';
    if (grade.length > 0 && grade.includes(k.grade))
      matchBadge += '<span class="match-badge" style="background:#eef2ff;color:#3730a3;margin-right:3px">🎓 Grade</span>';
    if (!matchBadge) matchBadge = '<span class="match-badge match-other">—</span>';

    // Employee status badge
    let empBadge = k.employeeStatus || '-';
    const esLow = String(k.employeeStatus).toLowerCase();
    if (esLow.includes('permanent') || esLow.includes('tetap')) empBadge = '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Permanent</span>';
    else if (esLow.includes('acting')) empBadge = '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Acting</span>';
    else if (esLow.includes('contract') || esLow.includes('kontrak')) empBadge = '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Contract</span>';

    const isChecked = k._tsChecked ? 'checked' : '';
    const ap12mVal = Number(k.ap12m).toFixed(2);

    const isTop5 = i < 5;
    const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : i === 3 ? 'rank-4' : i === 4 ? 'rank-5' : '';
    const crownMap = { 0: '🥇', 1: '🥈', 2: '🥉', 3: '4️⃣', 4: '5️⃣' };
    const rankLabel = isTop5 ? `<span title="Rank #${i + 1}" style="margin-left:3px;font-size:10px;">${crownMap[i] || ''}</span>` : '';

    html += `<tr class="${isTop5 ? 'rec-top-row ' + rankClass : ''}">
      <td style="text-align:center"><input type="checkbox" class="ts-check" data-nik="${k.nik}" ${isChecked} onchange="toggleTSCheck('${k.nik}',this.checked)"></td>
      <td><span class="row-num">${i + 1}</span>${rankLabel}</td>
      <td style="font-weight:600;font-size:12px;">${k.nik}</td>
      <td style="font-weight:${isTop5 ? '700' : '500'}">${k.name}</td>
      <td style="text-align:center">${k.age || '-'}</td>
      <td>${empBadge}</td>
      <td style="font-size:12px;">${k.position}</td>
      <td><span style="background:#eef2ff;color:var(--primary-dark);padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px">${k.grade}</span></td>
      <td style="font-size:12px;">${k.department || '-'}</td>
      <td style="font-size:12px;">${k.principal || '-'}</td>
      <td style="font-size:12px;">${k.regional || '-'}</td>
      <td style="font-weight:600;font-size:12px;">${k.branch}</td>
      <td><span style="font-weight:700;${k.rating === 'R1' ? 'color:#065f46;' : k.rating === 'R2' ? 'color:#1e40af;' : 'color:#6b7280;'}">${k.rating}</span></td>
      <td style="text-align:center;font-weight:600;">${ap12mVal}</td>
      <td style="font-size:12px;">${k.psiCur || '-'}</td>
      <td>${matchBadge}</td>
    </tr>`;
  });
  body.innerHTML = html;
}

function toggleTSCheck(nik, checked) {
  const k = _tsResults.find(k => String(k.nik) === String(nik));
  if (k) k._tsChecked = checked;
}

function toggleAllTSChecks(checked) {
  _tsResults.forEach(k => { k._tsChecked = checked; });
  document.querySelectorAll('.ts-check').forEach(cb => { cb.checked = checked; });
}

function downloadTSExcel() {
  const q = (document.getElementById('tsSearch')?.value || '').toLowerCase();
  let pool = _tsResults;
  if (q) {
    pool = _tsResults.filter(k =>
      [k.nik, k.name, k.position, k.branch, k.grade, k.department].join(' ').toLowerCase().includes(q)
    );
  }
  const checked = pool.filter(k => k._tsChecked);
  const data = checked.length > 0 ? checked : pool;

  if (data.length === 0) return showToast('Tidak ada data untuk didownload.');

  const headers = ['No', 'NIK', 'Nama', 'Usia', 'Employee Status', 'Position', 'Job Grade', 'Department', 'Principal', 'Region', 'Branch', 'PA Level', 'AP12M', 'Psikotest', 'HAV (Proyeksi)', 'P2K'];
  let csv = headers.join(',') + '\n';
  data.forEach((k, i) => {
    const row = [
      i + 1, k.nik,
      '"' + (k.name || '').replace(/"/g, '""') + '"',
      k.age || '',
      '"' + (k.employeeStatus || '') + '"',
      '"' + (k.position || '') + '"',
      k.grade,
      '"' + (k.department || '') + '"',
      '"' + (k.principal || '') + '"',
      '"' + (k.regional || '') + '"',
      '"' + (k.branch || '') + '"',
      k.rating,
      Number(k.ap12m).toFixed(2),
      '"' + (k.psiCur || '') + '"',
      '"' + (k.havProyeksi || '') + '"',
      k.p2k
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'TalentSearch_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ ' + (checked.length > 0 ? checked.length + ' selected' : 'All ' + data.length) + ' candidates downloaded!');
}

// --- SORT COLUMNS (shared for RTM and Talent Search) ---
function sortRecColumn(col) {
  if (_recSortState.col === col) {
    _recSortState.dir = _recSortState.dir === 1 ? 2 : _recSortState.dir === 2 ? 0 : 1;
    if (_recSortState.dir === 0) _recSortState.col = null;
  } else {
    _recSortState = { col, dir: 1 };
  }
  renderRecommendationTable();
  _updateSortArrows('recBody');
}

function sortTSColumn(col) {
  if (_tsSortState.col === col) {
    _tsSortState.dir = _tsSortState.dir === 1 ? 2 : _tsSortState.dir === 2 ? 0 : 1;
    if (_tsSortState.dir === 0) _tsSortState.col = null;
  } else {
    _tsSortState = { col, dir: 1 };
  }
  renderTSTable();
  _updateSortArrows('tsBody');
}

function _updateSortArrows(bodyId) {
  const state = bodyId === 'recBody' ? _recSortState : _tsSortState;
  const table = document.getElementById(bodyId)?.closest('table');
  if (!table) return;
  table.querySelectorAll('th[data-sort]').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    const col = th.getAttribute('data-sort');
    if (col === state.col) {
      arrow.textContent = state.dir === 1 ? ' ▲' : state.dir === 2 ? ' ▼' : '';
    } else {
      arrow.textContent = '';
    }
  });
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  fetchInitialData();
});




function formatEffectiveDateForInput(dateStr) {
  if (!dateStr) return '';
  
  const str = String(dateStr).trim();
  if (!str) return '';

  // 1. Jika sudah berformat YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 2. Jika berformat DD-MM-YYYY atau DD/MM/YYYY (contoh di sheet kamu: 06-09-2025)
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    let p1 = parts[0].padStart(2, '0');
    let p2 = parts[1].padStart(2, '0');
    let p3 = parts[2];

    // Jika formatnya DD-MM-YYYY (p3 adalah tahun 4 digit)
    if (p3.length === 4) {
      return `${p3}-${p2}-${p1}`; // Ubah ke YYYY-MM-DD
    }
    // Jika formatnya YYYY-MM-DD (p1 adalah tahun 4 digit)
    if (p1.length === 4) {
      return `${p1}-${p2}-${p3}`;
    }
  }

  // 3. Fallback jika berupa Date Object/ISO String
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

