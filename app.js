// Global state variables
let currentDataset = null;
let charts = {};

// ================================================================
// GLOBAL RESET ALL ANALYTICS
// ================================================================

function openResetModal() {
    const modal = document.getElementById('resetAllModal');
    if (modal) { modal.style.display = 'flex'; }
}

function closeResetModal() {
    const modal = document.getElementById('resetAllModal');
    if (modal) { modal.style.display = 'none'; }
}

function confirmResetAll() {
    closeResetModal();

    // ── TAB 2: Destroy all 4 EDA charts ──────────────────────────
    ['roleDist', 'eduDist', 'scoreExp', 'certImpact'].forEach(key => {
        if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    });
    // Re-render Tab 2 charts from current dataset
    try { renderAnalyticsCharts(); } catch (e) { }

    // ── TAB 3: Clear Decision Tree metrics, tree visual, feature chart ──
    const metricIds = ['metricAccuracy', 'metricPrecision', 'metricRecall', 'metricF1'];
    metricIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '--%';
    });

    const treeContainer = document.getElementById('treeVisualizerContainer');
    if (treeContainer) {
        treeContainer.innerHTML = '<p class="text-muted text-center p-5">Train the Decision Tree model above to visualize nodes, splits, and decision rules.</p>';
    }

    const textRulesCode = document.getElementById('textRulesCode');
    if (textRulesCode) textRulesCode.innerText = '';

    const textRulesCard = document.getElementById('textRulesCard');
    if (textRulesCard) textRulesCard.style.display = 'none';

    if (charts['featureImp']) { charts['featureImp'].destroy(); delete charts['featureImp']; }

    // ── TAB 4: Clear Alternate Role Matching ─────────────────────
    const altLoadingEl = document.getElementById('altLoadingState');
    const altTableEl = document.getElementById('altTableContainer');
    const altCardsEl = document.getElementById('altRoleSummaryCards');
    const altDemandEl = document.getElementById('altRoleDemandCard');

    if (altCardsEl) altCardsEl.style.display = 'none';
    if (altDemandEl) altDemandEl.style.display = 'none';
    if (altTableEl) altTableEl.style.display = 'none';

    const altBody = document.getElementById('altTableBody');
    if (altBody) altBody.innerHTML = '';

    const altDemandBars = document.getElementById('altRoleDemandBars');
    if (altDemandBars) altDemandBars.innerHTML = '';

    if (altLoadingEl) {
        altLoadingEl.style.display = 'block';
        altLoadingEl.innerHTML = `<i class="fa-solid fa-rotate-left" style="font-size:2rem; color:#6366f1;"></i>
            <p style="margin-top:0.75rem;">Analytics reset. Click the tab to reload.</p>`;
    }

    // Reset stat values
    ['altTotalCandidates', 'altWithMatches', 'altTopRole', 'altAvgMatch'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = id === 'altTopRole' ? '—' : (id === 'altAvgMatch' ? '0%' : '0');
    });

    const countTag = document.getElementById('reassignedCountTag');
    if (countTag) countTag.innerText = '0 Candidates';

    altRolesData = [];

    // ── TAB 5: Clear Candidate Simulator ─────────────────────────
    const simResult = document.getElementById('simResultContent');
    if (simResult) {
        simResult.innerHTML = `
            <i class="fa-solid fa-user-clock text-muted" style="font-size: 3rem;"></i>
            <p class="text-muted margin-top">Fill in candidate details and click Evaluate to see primary role verdict and alternate skill matching.</p>
        `;
    }

    // ── NAVBAR: Reset model status badge ─────────────────────────
    const badge = document.getElementById('modelStatusBadge');
    if (badge) {
        badge.innerHTML = `
            <span class="status-dot warning"></span>
            <span>Model: Untrained</span>
        `;
    }

    // ── Toast notification ────────────────────────────────────────
    showResetToast();
}

function showResetToast() {
    // Create toast if not already existing
    let toast = document.getElementById('globalResetToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalResetToast';
        toast.style.cssText = `
            position:fixed; bottom:1.5rem; right:1.5rem; z-index:99999;
            background:linear-gradient(135deg,#1e293b,#0f172a);
            border:1px solid rgba(99,102,241,0.5);
            border-left: 4px solid #6366f1;
            border-radius:10px; padding:0.85rem 1.25rem;
            display:flex; align-items:center; gap:0.75rem;
            font-size:0.875rem; color:#f1f5f9;
            box-shadow:0 8px 30px rgba(0,0,0,0.5);
            animation: slideUp 0.3s ease;
            min-width:280px;
        `;
        document.body.appendChild(toast);
    }
    toast.innerHTML = `
        <i class="fa-solid fa-circle-check" style="color:#10b981; font-size:1.1rem;"></i>
        <div>
            <div style="font-weight:600;">All Analytics Reset</div>
            <div style="font-size:0.78rem; color:#94a3b8; margin-top:2px;">5 areas cleared across all tabs</div>
        </div>
    `;
    toast.style.display = 'flex';
    setTimeout(() => { if (toast) toast.style.display = 'none'; }, 3500);
}


document.addEventListener('DOMContentLoaded', () => {
    loadSampleDataset();
});

// Navigation Tab Switcher
function switchTab(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (el) el.classList.add('active');

    if (tabId === 'analyticsTab') {
        setTimeout(renderAnalyticsCharts, 100);
    }
    if (tabId === 'reallocationTab') {
        loadAlternateRoles();
    }
    if (tabId === 'unsuitableTab') {
        loadActionBoard();
    }
}

// File Upload Handler
function triggerFileUpload() {
    const input = document.getElementById('csvFileInput');
    if (input) input.click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.innerHTML = `
            <div class="drop-zone-content">
                <i class="fa-solid fa-spinner fa-spin drop-icon"></i>
                <h3>Processing & Parsing CSV Dataset...</h3>
                <p>Extracting candidate attributes, detecting target columns, and computing EDA metrics.</p>
            </div>
        `;
    }

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            resetDropZoneUI();
            if (data.error) {
                alert('Upload Error: ' + data.error);
                return;
            }
            if (data.data) {
                processDatasetResponse(data.data);
                alert('Dataset uploaded & synced successfully! Total Records: ' + data.data.total_records);
            }
        })
        .catch(err => {
            resetDropZoneUI();
            alert('Upload failed: ' + err);
        });
}

function resetDropZoneUI() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;
    dropZone.innerHTML = `
        <div class="drop-zone-content">
            <i class="fa-solid fa-cloud-arrow-up drop-icon"></i>
            <h3>Upload Recruitment Dataset (.CSV)</h3>
            <p>Drag & drop your CSV file here, or click to browse. Features, categorical attributes, and hiring outcomes will be automatically parsed.</p>
            <div class="sample-dataset-prompt">
                <span>Or use default benchmark:</span>
                <button type="button" class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); loadSampleDataset();">
                    <i class="fa-solid fa-database"></i> Load Benchmark Dataset (250 Records)
                </button>
            </div>
        </div>
    `;
}

// Load Benchmark Sample Dataset
function loadSampleDataset() {
    fetch('/api/dataset-info')
        .then(res => res.json())
        .then(res => {
            if (res.loaded && res.data) {
                processDatasetResponse(res.data);
            }
        })
        .catch(err => console.error("Error loading dataset info:", err));
}

function processDatasetResponse(data) {
    if (!data) return;
    currentDataset = data;

    // 1. Metric Cards
    const elRecords = document.getElementById('valTotalRecords');
    const elFeatures = document.getElementById('valTotalFeatures');
    if (elRecords) elRecords.innerText = data.total_records || 0;
    if (elFeatures) elFeatures.innerText = data.total_features || 0;

    const elHired = document.getElementById('valHiredCount');
    const elRejected = document.getElementById('valRejectedCount');
    if (elHired) elHired.innerText
        = data.unique_roles_count || (data.unique_roles ? data.unique_roles.length : 6);
    if (elRejected) elRejected.innerText = data.unique_certs_count || 6;

    // 2. Dynamic Target Column Dropdown (#selectTargetCol)
    const selectTarget = document.getElementById('selectTargetCol');
    if (selectTarget && data.columns) {
        selectTarget.innerHTML = '';
        data.columns.forEach(col => {
            const opt = document.createElement('option');
            opt.value = col.name;
            opt.innerText = col.name;
            if (col.name === 'Applied_Role_Status' || col.name.toLowerCase().includes('status') || col.name.toLowerCase().includes('target') || col.name.toLowerCase().includes('result')) {
                opt.selected = true;
            }
            selectTarget.appendChild(opt);
        });
    }

    // 3. Dynamic Applied Role Dropdown (#simAppliedRole) Sync from dataset
    const selectRole = document.getElementById('simAppliedRole');
    if (selectRole && data.unique_roles && data.unique_roles.length > 0) {
        selectRole.innerHTML = '<option value="">-- Select from dataset --</option>';
        data.unique_roles.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r;
            opt.innerText = r;
            selectRole.appendChild(opt);
        });
    }

    // Dynamic Education Level Dropdown from dataset unique values
    const selectEdu = document.getElementById('simEducation');
    if (selectEdu && data.preview_data && data.preview_data.length > 0) {
        const eduKey = Object.keys(data.preview_data[0]).find(k => k.toLowerCase().includes('edu') || k.toLowerCase().includes('degree'));
        if (eduKey) {
            const uniqueEdu = [...new Set(data.preview_data.map(r => r[eduKey]).filter(Boolean).map(String))];
            selectEdu.innerHTML = '<option value="">-- Select from dataset --</option>';
            uniqueEdu.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e;
                opt.innerText = e;
                selectEdu.appendChild(opt);
            });
        }
    }

    // Dynamic Primary Certification Dropdown from dataset unique values
    const selectCert = document.getElementById('simCert');
    if (selectCert && data.preview_data && data.preview_data.length > 0) {
        const certKey = Object.keys(data.preview_data[0]).find(k => k.toLowerCase().includes('cert'));
        if (certKey) {
            const uniqueCerts = [...new Set(data.preview_data.map(r => r[certKey]).filter(Boolean).map(String))];
            selectCert.innerHTML = '<option value="">-- Select from dataset --</option>';
            uniqueCerts.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.innerText = c;
                selectCert.appendChild(opt);
            });
        }
    }

    // 4. Populate Candidate Selector Dropdown (#selectDatasetCandidate)
    const selectCand = document.getElementById('selectDatasetCandidate');
    if (selectCand && data.preview_data && data.preview_data.length > 0) {
        selectCand.innerHTML = '<option value="">-- Select Candidate from Uploaded Dataset --</option>';
        data.preview_data.forEach((row, idx) => {
            const id = row.Candidate_ID || row.ID || `CAND-${idx + 1}`;
            const name = row.Candidate_Name || row.Name || `Candidate #${idx + 1}`;
            const role = row.Applied_Role || row.Role || '';
            const status = row.Applied_Role_Status || row.Status || '';
            const opt = document.createElement('option');
            opt.value = idx;
            opt.innerText = `[${id}] ${name} - ${role} (${status})`;
            selectCand.appendChild(opt);
        });
    }

    // 5. Action Plan Candidate Dropdown (#selectActionCandidate)
    const selectActionCand = document.getElementById('selectActionCandidate');
    if (selectActionCand && data.preview_data && data.preview_data.length > 0) {
        selectActionCand.innerHTML = '<option value="">-- Choose Candidate --</option>';
        data.preview_data.forEach(cand => {
            const id = cand.Candidate_ID || cand.ID || 'CAND';
            const name = cand.Candidate_Name || cand.Name || 'Candidate';
            const role = cand.Applied_Role || cand.Role || '';
            const opt = document.createElement('option');
            opt.value = id;
            opt.innerText = `${id} - ${name} (${role})`;
            selectActionCand.appendChild(opt);
        });
    }

    // 5. Populate Column Explorer Table
    const colBody = document.querySelector('#columnsTable tbody');
    if (colBody && data.columns) {
        colBody.innerHTML = '';
        data.columns.forEach(col => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${col.name}</strong></td>
                <td><span class="badge ${col.type === 'Numeric' ? 'bg-green' : ''}">${col.type}</span></td>
                <td>${col.unique_count}</td>
                <td>${col.missing_count}</td>
            `;
            colBody.appendChild(row);
        });
    }

    // 6. Populate Data Preview Table
    const previewContainer = document.getElementById('previewTableContainer');
    if (previewContainer && data.preview_data && data.preview_data.length > 0) {
        const headers = Object.keys(data.preview_data[0]);
        let html = '<table class="data-table"><thead><tr>';
        headers.forEach(h => html += `<th>${h}</th>`);
        html += '</tr></thead><tbody>';

        data.preview_data.forEach(row => {
            html += '<tr>';
            headers.forEach(h => {
                const val = row[h];
                const hLower = String(h).toLowerCase();
                if (hLower.includes('role') || hLower.includes('cert')) {
                    html += `<td><span class="badge ${hLower.includes('role') ? 'bg-green' : ''}">${val}</span></td>`;
                } else {
                    html += `<td>${val !== null && val !== undefined ? val : ''}</td>`;
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        previewContainer.innerHTML = html;
    }

    // 7. Render Analytics Charts safely
    try {
        renderAnalyticsCharts();
    } catch (e) {
        console.warn("Analytics rendering warning:", e);
    }
}

// Select Candidate from Dataset Function
function populateCandidateFromDataset(indexVal) {
    if (indexVal === "" || !currentDataset || !currentDataset.preview_data) return;
    const cand = currentDataset.preview_data[indexVal];
    if (!cand) return;

    if (document.getElementById('simName')) document.getElementById('simName').value = cand.Candidate_Name || cand.Name || 'Candidate';
    if (document.getElementById('simAppliedRole')) document.getElementById('simAppliedRole').value = cand.Applied_Role || cand.Role || 'Software Engineer';
    if (document.getElementById('simEducation')) document.getElementById('simEducation').value = cand.Education_Level || cand.Degree || "Bachelor's";
    if (document.getElementById('simExp')) document.getElementById('simExp').value = cand.Years_Experience !== undefined ? cand.Years_Experience : 2;
    if (document.getElementById('simTechScore')) document.getElementById('simTechScore').value = cand.Technical_Test_Score !== undefined ? cand.Technical_Test_Score : 75;
    if (document.getElementById('simSoftScore')) document.getElementById('simSoftScore').value = cand.Soft_Skills_Rating !== undefined ? cand.Soft_Skills_Rating : 4.0;
    if (document.getElementById('simPortfolio')) document.getElementById('simPortfolio').value = cand.Portfolio_Score !== undefined ? cand.Portfolio_Score : 80;
    if (document.getElementById('simCert')) document.getElementById('simCert').value = cand.Primary_Certification || 'AWS Certified';
    if (document.getElementById('simSecSkills')) document.getElementById('simSecSkills').value = cand.Secondary_Skills || 'Python, SQL';
}

function pickRandomCandidate() {
    if (!currentDataset || !currentDataset.preview_data || currentDataset.preview_data.length === 0) {
        alert("Please load or upload a dataset first.");
        return;
    }
    const randomIndex = Math.floor(Math.random() * currentDataset.preview_data.length);
    const selectCand = document.getElementById('selectDatasetCandidate');
    if (selectCand) selectCand.value = randomIndex;
    populateCandidateFromDataset(randomIndex);

    const form = document.getElementById('simForm');
    if (form) {
        const event = new Event('submit', { cancelable: true, bubbles: true });
        form.dispatchEvent(event);
    }
}

// Evaluate Entire Dataset Sync Function
function evaluateEntireDataset() {
    fetch('/api/evaluate-dataset')
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert('Evaluation error: ' + data.error);
                return;
            }

            let html = `
            <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                <h4 style="color: #10b981;"><i class="fa-solid fa-square-check"></i> Synced Dataset Batch Evaluation (${data.total} Candidates Processed)</h4>
            </div>
            <div class="table-container scrollable-md">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Candidate ID</th>
                            <th>Name</th>
                            <th>Applied Role</th>
                            <th>Primary Outcome</th>
                            <th>Confidence</th>
                            <th>Alternate Role Recommendation</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

            data.dataset_evaluations.forEach(c => {
                let altText = '<span class="text-muted">No Alternate Roles</span>';
                if (c.Alternative_Role_Matches && c.Alternative_Role_Matches.length > 0) {
                    const topAlt = c.Alternative_Role_Matches[0];
                    altText = `<strong style="color: #38bdf8;">${topAlt.Role} (${topAlt.Match_Percentage}% Match)</strong>`;
                }

                html += `
                <tr>
                    <td><strong>${c.Candidate_ID}</strong></td>
                    <td>${c.Candidate_Name}</td>
                    <td>${c.Applied_Role}</td>
                    <td><span class="badge bg-green">${c.Primary_Prediction}</span></td>
                    <td>${c.Confidence}%</td>
                    <td>${altText}</td>
                </tr>
            `;
            });

            html += `
                    </tbody>
                </table>
            </div>
        `;

            const resContent = document.getElementById('simResultContent');
            if (resContent) resContent.innerHTML = html;
        })
        .catch(err => alert('Batch evaluation failed: ' + err));
}

// Chart.js EDA Visualizations with safety fallback
function renderAnalyticsCharts() {
    if (!currentDataset || !currentDataset.preview_data || currentDataset.preview_data.length === 0) return;

    if (typeof Chart === 'undefined') {
        console.warn("Chart.js library not loaded yet.");
        return;
    }

    const data = currentDataset.preview_data;
    const keys = Object.keys(data[0]);

    const roleKey = keys.find(k => k.toLowerCase().includes('role') || k.toLowerCase().includes('job') || k.toLowerCase().includes('dept')) || keys[0];
    const statusKey = keys.find(k => k.toLowerCase().includes('status') || k.toLowerCase().includes('target') || k.toLowerCase().includes('result')) || keys[keys.length - 1];
    const eduKey = keys.find(k => k.toLowerCase().includes('edu') || k.toLowerCase().includes('degree')) || keys[1] || keys[0];
    const expKey = keys.find(k => k.toLowerCase().includes('exp')) || keys.find(k => typeof data[0][k] === 'number') || keys[0];
    const scoreKey = keys.find(k => k.toLowerCase().includes('score') || k.toLowerCase().includes('marks') || k.toLowerCase().includes('test')) || keys.find(k => typeof data[0][k] === 'number' && k !== expKey) || keys[0];
    const certKey = keys.find(k => k.toLowerCase().includes('cert') || k.toLowerCase().includes('skill')) || keys[2] || keys[0];

    // 1. Role Distribution Chart
    const roles = {};
    data.forEach(d => {
        const r = String(d[roleKey] || 'General');
        roles[r] = (roles[r] || 0) + 1;
    });

    const roleLabels = Object.keys(roles);
    const roleCounts = Object.values(roles);

    const ctxRole = document.getElementById('chartRoleDistribution');
    if (ctxRole) {
        if (charts.roleDist) charts.roleDist.destroy();
        charts.roleDist = new Chart(ctxRole, {
            type: 'bar',
            data: {
                labels: roleLabels,
                datasets: [
                    { label: 'Candidate Count', data: roleCounts, backgroundColor: '#6366f1' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }

    // 2. Education Distribution Chart
    const eduCounts = {};
    data.forEach(d => {
        const e = String(d[eduKey] || 'Standard');
        eduCounts[e] = (eduCounts[e] || 0) + 1;
    });

    const ctxEdu = document.getElementById('chartEducationDistribution');
    if (ctxEdu) {
        if (charts.eduDist) charts.eduDist.destroy();
        charts.eduDist = new Chart(ctxEdu, {
            type: 'doughnut',
            data: {
                labels: Object.keys(eduCounts),
                datasets: [{
                    data: Object.values(eduCounts),
                    backgroundColor: ['#6366f1', '#0ea5e9', '#a855f7', '#f59e0b', '#10b981']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
            }
        });
    }

    // 3. Score vs Experience Scatter Chart
    const scatterPoints = data.map(d => ({
        x: parseFloat(d[expKey]) || 0,
        y: parseFloat(d[scoreKey]) || 50
    }));

    const ctxScore = document.getElementById('chartScoreVsExp');
    if (ctxScore) {
        if (charts.scoreExp) charts.scoreExp.destroy();
        charts.scoreExp = new Chart(ctxScore, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Candidate Profiles',
                        data: scatterPoints,
                        backgroundColor: '#0ea5e9'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    x: { title: { display: true, text: expKey, color: '#94a3b8' }, ticks: { color: '#94a3b8' } },
                    y: { title: { display: true, text: scoreKey, color: '#94a3b8' }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }

    // 4. Certification Impact
    const certs = {};
    data.forEach(d => {
        const c = String(d[certKey] || 'None');
        certs[c] = (certs[c] || 0) + 1;
    });

    const certLabels = Object.keys(certs);
    const certCounts = Object.values(certs);

    const ctxCert = document.getElementById('chartCertImpact');
    if (ctxCert) {
        if (charts.certImpact) charts.certImpact.destroy();
        charts.certImpact = new Chart(ctxCert, {
            type: 'bar',
            data: {
                labels: certLabels,
                datasets: [{
                    label: 'Candidates Count',
                    data: certCounts,
                    backgroundColor: '#a855f7'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    x: { ticks: { color: '#94a3b8' } },
                    y: { ticks: { color: '#94a3b8' } }
                }
            }
        });
    }
}

// -------------------------------------------------------
// ANALYTICS RESET & CHART TYPE TOGGLE FUNCTIONS
// -------------------------------------------------------

/** Destroy all 4 charts, re-render them at defaults, show confirmation banner */
function resetAnalyticsCharts() {
    // Destroy all existing chart instances
    ['roleDist', 'eduDist', 'scoreExp', 'certImpact', 'featureImp'].forEach(key => {
        if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    });

    // Re-render with original defaults
    renderAnalyticsCharts();

    // Show confirmation banner for 2.5 seconds
    const banner = document.getElementById('analyticsResetBanner');
    if (banner) {
        banner.style.display = 'flex';
        setTimeout(() => { banner.style.display = 'none'; }, 2500);
    }

    // Button pulse feedback
    const btn = document.getElementById('btnResetCharts');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Reset Done';
        btn.style.color = '#10b981';
        setTimeout(() => {
            btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Reset Charts';
            btn.style.color = '';
        }, 2000);
    }
}

/** Silently re-render all charts from current dataset (no banner) */
function refreshAnalyticsCharts() {
    ['roleDist', 'eduDist', 'scoreExp', 'certImpact'].forEach(key => {
        if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    });
    renderAnalyticsCharts();
}

/** Toggle a specific chart between two chart types */
function toggleChartType(chartKey, newType) {
    if (!charts[chartKey] || !currentDataset || !currentDataset.preview_data) return;

    const existingChart = charts[chartKey];
    const existingData = existingChart.data;
    const existingOpts = existingChart.options;
    const canvas = existingChart.canvas;

    existingChart.destroy();
    delete charts[chartKey];

    // For horizontal bar in Chart.js v3+, use 'bar' with indexAxis:'y'
    let finalType = newType;
    let extraOpts = {};
    if (newType === 'horizontalBar') {
        finalType = 'bar';
        extraOpts = { indexAxis: 'y' };
    }

    charts[chartKey] = new Chart(canvas, {
        type: finalType,
        data: existingData,
        options: {
            ...existingOpts,
            ...extraOpts,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: (finalType === 'pie' || finalType === 'doughnut') ? 'right' : 'top',
                    labels: { color: '#94a3b8' }
                }
            },
            scales: (finalType === 'pie' || finalType === 'doughnut') ? {} : {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

/** Reset a single chart back to its original default type */
function resetSingleChart(chartKey) {
    const defaultTypes = {
        roleDist: 'bar',
        eduDist: 'doughnut',
        scoreExp: 'scatter',
        certImpact: 'bar'
    };
    if (!defaultTypes[chartKey]) return;

    // Rebuild from scratch using renderAnalyticsCharts logic
    if (charts[chartKey]) { charts[chartKey].destroy(); delete charts[chartKey]; }

    // Re-call the full render (it skips already-rendered charts, so destroying first is enough)
    renderAnalyticsCharts();
}


function handleTrainModel(event) {
    event.preventDefault();

    const btnTrain = document.getElementById('btnTrainModel');
    if (btnTrain) {
        btnTrain.disabled = true;
        btnTrain.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analyzing Decision Tree...`;
    }

    const modal = document.getElementById('treeLoadingModal');
    const percentText = document.getElementById('treePercentText');
    const stepText = document.getElementById('treeStepText');

    if (modal) modal.style.display = 'flex';
    if (percentText) percentText.innerText = '0%';
    if (stepText) stepText.innerText = 'Initializing Decision Tree Classifier...';

    const payload = {
        target_col: document.getElementById('selectTargetCol').value,
        criterion: document.getElementById('selectCriterion').value,
        max_depth: parseInt(document.getElementById('inputMaxDepth').value),
        min_samples_split: parseInt(document.getElementById('inputMinSplit').value)
    };

    let progress = 0;
    const totalDuration = 3000; // 3 seconds
    const intervalTime = 40;
    const increment = (intervalTime / totalDuration) * 100;

    const progressInterval = setInterval(() => {
        progress += increment;
        if (progress > 100) progress = 100;

        if (percentText) percentText.innerText = `${Math.round(progress)}%`;

        if (progress >= 85) {
            if (stepText) stepText.innerText = 'Rendering Interactive Flowchart & Re-allocations...';
        } else if (progress >= 55) {
            if (stepText) stepText.innerText = 'Evaluating Precision, Recall & Confusion Matrix...';
        } else if (progress >= 25) {
            if (stepText) stepText.innerText = 'Mining Candidate Features & Calculating Node Impurity...';
        }
    }, intervalTime);

    // Fetch API request
    fetch('/api/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(data => {
            // Wait for full 3-second animation to finish before rendering results
            setTimeout(() => {
                clearInterval(progressInterval);
                if (modal) modal.style.display = 'none';

                if (btnTrain) {
                    btnTrain.disabled = false;
                    btnTrain.innerHTML = `<i class="fa-solid fa-gears"></i> Train Decision Tree Classifier`;
                }

                if (data.error) {
                    alert('Training error: ' + data.error);
                    return;
                }

                // Update status badge
                const badge = document.getElementById('modelStatusBadge');
                if (badge) {
                    badge.innerHTML = `
                    <span class="status-dot green"></span>
                    <span>Model: Trained (${data.metrics.accuracy}% Acc)</span>
                `;
                }

                // Metrics
                const elAcc = document.getElementById('metricAccuracy');
                const elPrec = document.getElementById('metricPrecision');
                const elRec = document.getElementById('metricRecall');
                const elF1 = document.getElementById('metricF1');
                if (elAcc) elAcc.innerText = `${data.metrics.accuracy}%`;
                if (elPrec) elPrec.innerText = `${data.metrics.precision}%`;
                if (elRec) elRec.innerText = `${data.metrics.recall}%`;
                if (elF1) elF1.innerText = `${data.metrics.f1_score}%`;

                // Render Feature Importance Chart
                renderFeatureImportance(data.feature_importances);

                // Render Tree SVG Graph
                renderTreeSVG(data.tree_json);

                // Text Rules
                const elRules = document.getElementById('textRulesCode');
                if (elRules) elRules.innerText = data.rules_text;

                // Render Re-assigned Candidates Table
                renderReassignedTable(data.reassigned_candidates);

            }, Math.max(0, totalDuration - (progress * 30)));
        })
        .catch(err => {
            clearInterval(progressInterval);
            if (modal) modal.style.display = 'none';
            if (btnTrain) {
                btnTrain.disabled = false;
                btnTrain.innerHTML = `<i class="fa-solid fa-gears"></i> Train Decision Tree Classifier`;
            }
            alert('Failed to train model: ' + err);
        });
}

// Feature Importance Chart
function renderFeatureImportance(importances) {
    if (!importances || typeof Chart === 'undefined') return;
    const labels = importances.map(i => i.feature);
    const values = importances.map(i => Math.round(i.importance * 100));

    const ctx = document.getElementById('chartFeatureImportance');
    if (ctx) {
        if (charts.featureImp) charts.featureImp.destroy();
        charts.featureImp = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Importance Weight %',
                    data: values,
                    backgroundColor: '#6366f1'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#94a3b8' } },
                    y: { ticks: { color: '#94a3b8' } }
                }
            }
        });
    }
}

// SVG Decision Tree Flowchart Renderer
function renderTreeSVG(treeData) {
    const container = document.getElementById('treeVisualizerContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!treeData) return;

    const svgWidth = 900;
    const svgHeight = 420;

    let svgHtml = `<svg width="${svgWidth}" height="${svgHeight}" style="font-family: sans-serif;">`;

    function drawNode(node, x, y, level, dx) {
        if (!node) return '';

        const nodeW = 140;
        const nodeH = 55;
        let content = '';

        if (node.type === 'node') {
            content += `
                <rect x="${x - nodeW / 2}" y="${y}" width="${nodeW}" height="${nodeH}" class="tree-node-rect" />
                <text x="${x}" y="${y + 20}" fill="#fff" font-size="11" font-weight="bold" text-anchor="middle">${node.feature}</text>
                <text x="${x}" y="${y + 36}" fill="#94a3b8" font-size="10" text-anchor="middle">&le; ${node.threshold} (Gini: ${node.impurity})</text>
            `;

            if (node.left) {
                const childX = x - dx;
                const childY = y + 85;
                content += `<line x1="${x}" y1="${y + nodeH}" x2="${childX}" y2="${childY}" stroke="#6366f1" stroke-width="1.5" />`;
                content += `<text x="${(x + childX) / 2 - 10}" y="${(y + childY) / 2}" fill="#10b981" font-size="9">True</text>`;
                content += drawNode(node.left, childX, childY, level + 1, dx / 2);
            }
            if (node.right) {
                const childX = x + dx;
                const childY = y + 85;
                content += `<line x1="${x}" y1="${y + nodeH}" x2="${childX}" y2="${childY}" stroke="#6366f1" stroke-width="1.5" />`;
                content += `<text x="${(x + childX) / 2 + 10}" y="${(y + childY) / 2}" fill="#ef4444" font-size="9">False</text>`;
                content += drawNode(node.right, childX, childY, level + 1, dx / 2);
            }
        } else {
            const predLower = String(node.label).toLowerCase();
            const isSuitableNode = (predLower.includes('suitable') && !predLower.includes('not')) || predLower.includes('hire') || predLower.includes('pass');
            const rectClass = isSuitableNode ? 'tree-leaf-rect' : 'tree-leaf-rejected';
            content += `
                <rect x="${x - nodeW / 2}" y="${y}" width="${nodeW}" height="${nodeH}" class="${rectClass}" />
                <text x="${x}" y="${y + 22}" fill="#fff" font-size="12" font-weight="bold" text-anchor="middle">${node.label}</text>
                <text x="${x}" y="${y + 38}" fill="#e2e8f0" font-size="10" text-anchor="middle">Samples: ${node.samples}</text>
            `;
        }

        return content;
    }

    svgHtml += drawNode(treeData, svgWidth / 2, 20, 1, 200);
    svgHtml += '</svg>';

    container.innerHTML = svgHtml;
}

// Re-assigned Candidates Table
function renderReassignedTable(candidates) {
    const tbody = document.querySelector('#reassignedTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const count = candidates ? candidates.length : 0;
    const badge = document.getElementById('reassignedBadge');
    const countTag = document.getElementById('reassignedCountTag');
    if (badge) badge.innerText = count;
    if (countTag) countTag.innerText = `${count} Candidates Saved`;

    if (!candidates || candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center">No candidate re-assignments available for this dataset.</td></tr>';
        return;
    }

    candidates.forEach(c => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${c.Candidate_ID}</strong></td>
            <td>${c.Candidate_Name}</td>
            <td><span class="text-muted">${c.Applied_Role}</span></td>
            <td><strong style="color: #10b981;">${c.Alternative_Role}</strong></td>
            <td><span class="badge bg-green">${c.Match_Percentage}% Match</span></td>
            <td>${c.Key_Secondary_Skills}</td>
            <td>${c.Certification}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="alert('Offer letter generated for ${c.Candidate_Name} (${c.Alternative_Role})')"><i class="fa-solid fa-paper-plane"></i> Re-allocate Offer</button></td>
        `;
        tbody.appendChild(row);
    });
}

// -------------------------------------------------------
// TAB 4: ALTERNATE ROLE MATCHING - Auto-load Functions
// -------------------------------------------------------
let altRolesData = []; // full dataset cache for filtering

function loadAlternateRoles() {
    const loadingEl = document.getElementById('altLoadingState');
    const tableEl = document.getElementById('altTableContainer');
    const cardsEl = document.getElementById('altRoleSummaryCards');
    const demandEl = document.getElementById('altRoleDemandCard');

    if (loadingEl) loadingEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (cardsEl) cardsEl.style.display = 'none';
    if (demandEl) demandEl.style.display = 'none';

    fetch('/api/alternate-roles')
        .then(res => res.json())
        .then(data => {
            if (loadingEl) loadingEl.style.display = 'none';
            if (data.error) {
                if (loadingEl) loadingEl.innerHTML = `<p style="color:#f87171;"><i class="fa-solid fa-circle-exclamation"></i> ${data.error}</p>`;
                return;
            }

            altRolesData = data.candidates || [];

            // Populate extra-skills candidate selector
            const extraSel = document.getElementById('extraSkillsCandidateSelect');
            if (extraSel) {
                extraSel.innerHTML = '<option value="">-- Select Candidate --</option>';
                altRolesData.forEach((c, idx) => {
                    const opt = document.createElement('option');
                    opt.value = idx;
                    opt.innerText = `[${c.Candidate_ID}] ${c.Candidate_Name} — ${c.Applied_Role}`;
                    extraSel.appendChild(opt);
                });
            }

            // Summary cards
            const elTotal = document.getElementById('altTotalCandidates');
            const elUnsuitable = document.getElementById('altUnsuitableCount');
            const elSuitable = document.getElementById('altSuitableCount');
            const elTopRole = document.getElementById('altTopRole');

            if (elTotal) elTotal.innerText = data.total_candidates || 0;
            if (elUnsuitable) elUnsuitable.innerText = data.unsuitable_count || 0;
            if (elSuitable) elSuitable.innerText = data.suitable_count || 0;

            const roleDemand = data.role_demand_summary || {};
            const topRole = Object.entries(roleDemand).sort((a, b) => b[1] - a[1])[0];
            if (elTopRole) elTopRole.innerText = topRole ? topRole[0].split(' ')[0] : '—';

            if (cardsEl) cardsEl.style.display = 'grid';

            renderDemandBars(roleDemand);
            if (demandEl) demandEl.style.display = 'block';

            const countTag = document.getElementById('reassignedCountTag');
            if (countTag) countTag.innerText = `${altRolesData.length} Not-Suitable`;

            renderAltRolesTable(altRolesData);
            if (tableEl) tableEl.style.display = 'block';
        })
        .catch(err => {
            if (loadingEl) loadingEl.innerHTML = `<p style="color:#f87171;"><i class="fa-solid fa-circle-exclamation"></i> Failed: ${err}</p>`;
        });
}

function renderDemandBars(roleDemand) {
    const container = document.getElementById('altRoleDemandBars');
    if (!container) return;

    const maxVal = Math.max(...Object.values(roleDemand));
    const roleColors = {
        'Data Analyst': '#38bdf8',
        'Cloud Engineer': '#10b981',
        'DevOps Specialist': '#6366f1',
        'Business Analyst': '#f59e0b',
        'QA Engineer': '#ef4444',
        'Software Engineer': '#a855f7'
    };

    container.innerHTML = Object.entries(roleDemand)
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => {
            const pct = Math.round((count / maxVal) * 100);
            const color = roleColors[role] || '#6366f1';
            return `
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div style="width:130px; font-size:0.8rem; color:#cbd5e1; flex-shrink:0;">${role}</div>
                    <div style="flex:1; background:rgba(255,255,255,0.05); border-radius:99px; height:10px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${color}; border-radius:99px; transition: width 0.6s ease;"></div>
                    </div>
                    <div style="width:50px; font-size:0.8rem; color:${color}; font-weight:600; text-align:right;">${count}</div>
                </div>
            `;
        }).join('');
}

function renderAltRolesTable(candidates) {
    const tbody = document.getElementById('altTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!candidates || candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center">All candidates meet company constraints — no not-suitable candidates found.</td></tr>';
        return;
    }

    const rankColors = ['#34d399', '#22d3ee', '#a78bfa'];

    candidates.forEach((c, idx) => {
        const alts = c.Top3_Alternatives || [];
        const failed = (c.Failed_Constraints || []).slice(0, 2).join('; ');
        const extraCount = (c.Extra_Skills_Roles || []).length;

        function altCell(alt, rankIdx) {
            if (!alt) return `<td><span class="text-muted" style="font-size:0.78rem;">—</span></td>`;
            return `
                <td>
                    <div style="font-weight:600; color:${rankColors[rankIdx]}; font-size:0.83rem;">${alt.Role}</div>
                    <span class="badge" style="background:rgba(52,211,153,0.12); color:${rankColors[rankIdx]}; font-size:0.68rem;">${alt.Match_Percentage}% match</span>
                </td>
            `;
        }

        const row = document.createElement('tr');
        row.setAttribute('data-search', `${c.Candidate_ID} ${c.Candidate_Name} ${c.Applied_Role} ${alts.map(a => a.Role).join(' ')}`.toLowerCase());
        row.innerHTML = `
            <td><strong>${c.Candidate_ID}</strong></td>
            <td>${c.Candidate_Name}</td>
            <td><span class="badge" style="background:rgba(248,113,113,0.15); color:#f87171; font-size:0.75rem;">${c.Applied_Role}</span></td>
            <td style="font-size:0.75rem; color:#f87171; max-width:160px; white-space:normal;">${failed || '—'}</td>
            ${altCell(alts[0], 0)}
            ${altCell(alts[1], 1)}
            ${altCell(alts[2], 2)}
            <td>
                ${extraCount > 0
                ? `<button class="btn btn-outline btn-sm" style="font-size:0.72rem;" onclick="runExtraSkillsAnalysis(${idx}, '${c.Candidate_ID}')"><i class="fa-solid fa-magnifying-glass-chart"></i> ${extraCount} Extra Skills</button>`
                : `<span class="text-muted" style="font-size:0.75rem;">None</span>`}
            </td>
            <td>
                <button class="btn btn-sm" style="background:rgba(251,191,36,0.15); color:#fbbf24; font-size:0.72rem;" onclick="sendToActionPage('${c.Candidate_ID}')">
                    <i class="fa-solid fa-arrow-right"></i> Action
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ─────────────────────────────────────────────────────────
// EXTRA SKILLS ANALYZER
// ─────────────────────────────────────────────────────────
function runExtraSkillsAnalysis(idx, candId) {
    // Scroll to analyzer panel
    const resultEl = document.getElementById('extraSkillsResult');
    if (!resultEl) return;

    // Sync the select dropdown if called from table button
    const sel = document.getElementById('extraSkillsCandidateSelect');
    if (sel && idx !== undefined) sel.value = idx;

    const cand = altRolesData[idx];
    if (!cand) { resultEl.innerHTML = '<span class="text-muted">Candidate not found.</span>'; return; }

    resultEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:var(--primary);"></i> Analyzing extra skills...`;

    fetch('/api/extra-skills-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cand)
    })
        .then(r => r.json())
        .then(data => {
            const roles = data.extra_skills_roles || [];
            if (roles.length === 0) {
                resultEl.innerHTML = `<span class="text-muted" style="font-size:0.85rem;"><i class="fa-solid fa-info-circle"></i> No significant extra skills found beyond applied role requirements for <strong>${cand.Candidate_Name}</strong>.</span>`;
                return;
            }
            const colors = ['#34d399', '#22d3ee', '#a78bfa'];
            let html = `<div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.5rem;">Extra skills for <strong style="color:var(--primary);">${cand.Candidate_Name}</strong> (${cand.Applied_Role}) that add value elsewhere:</div>`;
            html += `<div style="display:flex; flex-wrap:wrap; gap:0.6rem;">`;
            roles.forEach((r, i) => {
                html += `
                <div style="background:rgba(0,212,170,0.07); border:1px solid rgba(0,212,170,0.2); border-radius:8px; padding:0.6rem 0.9rem; min-width:160px;">
                    <div style="color:${colors[i]}; font-weight:700; font-size:0.85rem;">${r.role}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${r.extra_skills.join(', ')}</div>
                    <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">${r.value_reasons.slice(0, 2).join(' · ')}</div>
                </div>
            `;
            });
            html += `</div>`;
            resultEl.innerHTML = html;
        })
        .catch(() => { resultEl.innerHTML = '<span style="color:#f87171;">Analysis failed.</span>'; });
}

function filterAltTable(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('#altTableBody tr').forEach(row => {
        const text = row.getAttribute('data-search') || '';
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

// ─────────────────────────────────────────────────────────
// SEND TO ACTION PAGE
// ─────────────────────────────────────────────────────────
function sendToActionPage(candId) {
    // Switch to Tab 6
    const tab6Btn = document.querySelector('button[onclick*="unsuitableTab"]');
    if (tab6Btn) tab6Btn.click();
    // Pre-select this candidate in the action plan selector
    setTimeout(() => {
        const sel = document.getElementById('selectActionCandidate');
        if (sel) { sel.value = candId; sel.dispatchEvent(new Event('change')); }
    }, 600);
}

// ─────────────────────────────────────────────────────────
// TAB 6: ACTION STATUS BOARD
// ─────────────────────────────────────────────────────────
const actionStatuses = {};   // candId -> status string

function loadActionBoard() {
    const loadEl = document.getElementById('actionBoardLoading');
    const tableEl = document.getElementById('actionBoardTable');
    if (loadEl) loadEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';

    fetch('/api/alternate-roles')
        .then(r => r.json())
        .then(data => {
            if (loadEl) loadEl.style.display = 'none';
            if (data.error) {
                if (loadEl) loadEl.innerHTML = `<p style="color:#f87171;">${data.error}</p>`;
                return;
            }
            const candidates = data.candidates || [];
            renderActionBoard(candidates);
            if (tableEl) tableEl.style.display = 'block';

            // Populate detailed action-plan selector with unsuitable candidates only
            const sel = document.getElementById('selectActionCandidate');
            if (sel) {
                sel.innerHTML = '<option value="">-- Choose Candidate --</option>';
                candidates.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.Candidate_ID;
                    opt.innerText = `${c.Candidate_ID} - ${c.Candidate_Name} (${c.Applied_Role})`;
                    sel.appendChild(opt);
                });
            }
            const badge = document.getElementById('actionBoardCount');
            if (badge) badge.innerText = candidates.length;
        })
        .catch(err => {
            if (loadEl) loadEl.innerHTML = `<p style="color:#f87171;">Failed: ${err}</p>`;
        });
}

function renderActionBoard(candidates) {
    const tbody = document.getElementById('actionBoardBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!candidates.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center">No not-suitable candidates found.</td></tr>';
        return;
    }
    const statusOptions = ['Pending', 'Approve Transfer', 'Enroll Upskilling', 'Start PIP', 'Career Guidance', 'Reject'];
    const statusColors = { 'Pending': '#7a93aa', 'Approve Transfer': '#34d399', 'Enroll Upskilling': '#a78bfa', 'Start PIP': '#fbbf24', 'Career Guidance': '#22d3ee', 'Reject': '#f87171' };

    candidates.forEach(c => {
        const alt1 = c.Top3_Alternatives && c.Top3_Alternatives[0];
        const failed = (c.Failed_Constraints || []).slice(0, 2).join('; ');
        const savedStatus = actionStatuses[c.Candidate_ID] || 'Pending';
        const row = document.createElement('tr');
        row.setAttribute('data-search', `${c.Candidate_ID} ${c.Candidate_Name} ${c.Applied_Role}`.toLowerCase());
        row.id = `action-row-${c.Candidate_ID}`;
        row.innerHTML = `
            <td><strong>${c.Candidate_ID}</strong></td>
            <td>${c.Candidate_Name}</td>
            <td><span class="badge" style="background:rgba(248,113,113,0.15); color:#f87171; font-size:0.75rem;">${c.Applied_Role}</span></td>
            <td style="font-size:0.74rem; color:#f87171; max-width:160px; white-space:normal;">${failed || '—'}</td>
            <td style="font-size:0.82rem; color:#34d399; font-weight:600;">${alt1 ? alt1.Role + ' (' + alt1.Match_Percentage + '%)' : '—'}</td>
            <td>
                <select id="status-sel-${c.Candidate_ID}" class="form-control" style="padding:4px 8px; font-size:0.78rem; border-color:rgba(0,212,170,0.2);" onchange="previewStatus('${c.Candidate_ID}')">
                    ${statusOptions.map(s => `<option value="${s}" ${s === savedStatus ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </td>
            <td>
                <button class="btn btn-sm" id="confirm-btn-${c.Candidate_ID}" style="background:rgba(0,212,170,0.12); color:var(--primary); font-size:0.75rem;" onclick="confirmCandidateAction('${c.Candidate_ID}', '${c.Candidate_Name}')">
                    <i class="fa-solid fa-check"></i> Confirm
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function previewStatus(candId) {
    const sel = document.getElementById(`status-sel-${candId}`);
    const btn = document.getElementById(`confirm-btn-${candId}`);
    if (!sel || !btn) return;
    const status = sel.value;
    const colors = { 'Approve Transfer': '#34d399', 'Enroll Upskilling': '#a78bfa', 'Start PIP': '#fbbf24', 'Career Guidance': '#22d3ee', 'Reject': '#f87171', 'Pending': '#7a93aa' };
    btn.style.background = `rgba(${hexToRgb(colors[status] || '#7a93aa')},0.15)`;
    btn.style.color = colors[status] || '#7a93aa';
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}

function confirmCandidateAction(candId, candName) {
    const sel = document.getElementById(`status-sel-${candId}`);
    if (!sel) return;
    const status = sel.value;
    actionStatuses[candId] = status;

    const btn = document.getElementById(`confirm-btn-${candId}`);
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Done'; }

    // Show toast
    const statusMsgs = {
        'Approve Transfer': `${candName} approved for role transfer.`,
        'Enroll Upskilling': `${candName} enrolled in upskilling program.`,
        'Start PIP': `60-day PIP initiated for ${candName}.`,
        'Career Guidance': `Career guidance session scheduled for ${candName}.`,
        'Reject': `${candName} marked as rejected.`,
        'Pending': `${candName} status kept as Pending.`
    };
    showActionToast(statusMsgs[status] || `Action saved for ${candName}.`, status);
}

function showActionToast(msg, status) {
    const colors = { 'Approve Transfer': '#34d399', 'Enroll Upskilling': '#a78bfa', 'Start PIP': '#fbbf24', 'Career Guidance': '#22d3ee', 'Reject': '#f87171' };
    const color = colors[status] || 'var(--primary)';
    let toast = document.getElementById('actionToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'actionToast';
        toast.style.cssText = `position:fixed; bottom:1.5rem; right:1.5rem; z-index:99999;
            background:rgba(8,13,18,0.95); border-radius:10px; padding:0.85rem 1.25rem;
            display:flex; align-items:center; gap:0.75rem; font-size:0.875rem; color:#e2eaf4;
            box-shadow:0 8px 30px rgba(0,0,0,0.5); min-width:300px; animation:slideUp 0.3s ease;`;
        document.body.appendChild(toast);
    }
    toast.style.border = `1px solid ${color}`;
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:${color}; font-size:1.1rem;"></i><div>${msg}</div>`;
    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

function filterActionTable(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('#actionBoardBody tr').forEach(row => {
        const text = row.getAttribute('data-search') || '';
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

function toggleAltRulesMatrix() {
    const matrix = document.getElementById('altRulesMatrix');
    const chevron = document.getElementById('altRulesChevron');
    if (!matrix) return;
    const isHidden = matrix.style.display === 'none';
    matrix.style.display = isHidden ? 'block' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
}


function toggleTextRules() {
    const el = document.getElementById('textRulesCard');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// Candidate Simulator Handler
function handleSimulateCandidate(event) {
    event.preventDefault();

    const candidateData = {
        Candidate_Name: document.getElementById('simName').value,
        Applied_Role: document.getElementById('simAppliedRole').value,
        Education_Level: document.getElementById('simEducation').value,
        Years_Experience: parseFloat(document.getElementById('simExp').value),
        Technical_Test_Score: parseFloat(document.getElementById('simTechScore').value),
        Soft_Skills_Rating: parseFloat(document.getElementById('simSoftScore').value),
        Portfolio_Score: parseFloat(document.getElementById('simPortfolio').value),
        Primary_Certification: document.getElementById('simCert').value,
        Secondary_Skills: document.getElementById('simSecSkills').value
    };

    fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidateData)
    })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert('Prediction error: ' + data.error);
                return;
            }

            let html = `
            <div class="verdict-box hired">
                <div class="verdict-title">CLASSIFICATION: ${data.prediction}</div>
                <div class="verdict-sub">Primary Applied Role: <strong>${candidateData.Applied_Role}</strong> | Model Confidence: <strong>${data.confidence}%</strong></div>
            </div>
        `;

            if (data.alternative_role_matches && data.alternative_role_matches.length > 0) {
                html += `<h4 class="margin-top"><i class="fa-solid fa-wand-magic-sparkles" style="color: #10b981;"></i> Skill-Mined Alternative Role Recommendations:</h4>`;
                html += `<div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem;">`;

                data.alternative_role_matches.forEach((alt, idx) => {
                    html += `
                    <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(16, 185, 129, 0.4); padding: 1rem; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong style="color: #38bdf8; font-size: 1.05rem;">#${idx + 1} ${alt.Role}</strong>
                            <span class="badge bg-green">${alt.Match_Percentage}% Match</span>
                        </div>
                        <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">Matched Skills & Certs: ${alt.Matched_Criteria.join(', ')}</p>
                    </div>
                `;
                });
                html += `</div>`;
            }

            const resContent = document.getElementById('simResultContent');
            if (resContent) resContent.innerHTML = html;
        })
        .catch(err => alert('Evaluation failed: ' + err));
}

// ----------------------------------------------------
// TAB 6: NOT SUITABLE CANDIDATE ACTION CENTER
// ----------------------------------------------------
function handleSelectActionCandidate(candId) {
    if (!candId || !currentDataset || !currentDataset.preview_data) return;
    const cand = currentDataset.preview_data.find(c => String(c.Candidate_ID || c.ID) === String(candId));
    if (!cand) return;
    renderActionPlanForCandidate(cand);
}

function generateRandomActionPlan() {
    if (!currentDataset || !currentDataset.preview_data || currentDataset.preview_data.length === 0) return;
    const randCand = currentDataset.preview_data[Math.floor(Math.random() * currentDataset.preview_data.length)];
    const selectActionCand = document.getElementById('selectActionCandidate');
    if (selectActionCand) selectActionCand.value = randCand.Candidate_ID || randCand.ID;
    renderActionPlanForCandidate(randCand);
}

function renderActionPlanForCandidate(cand) {
    const summaryDiv = document.getElementById('actionCandidateSummary');
    if (summaryDiv) {
        summaryDiv.style.display = 'block';
        summaryDiv.innerHTML = `
            <h4 style="color: #38bdf8; margin-bottom: 0.5rem;"><i class="fa-solid fa-id-card"></i> Candidate Summary</h4>
            <div style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.6;">
                <div>Name: <strong>${cand.Candidate_Name}</strong></div>
                <div>Primary Applied Role: <strong style="color: #f59e0b;">${cand.Applied_Role}</strong></div>
                <div>Education: <strong>${cand.Education_Level}</strong> | Experience: <strong>${cand.Years_Experience} yrs</strong></div>
                <div>Tech Score: <strong>${cand.Technical_Test_Score}/100</strong> | Soft Skills: <strong>${cand.Soft_Skills_Rating}/5.0</strong></div>
                <div>Primary Cert: <strong>${cand.Primary_Certification}</strong></div>
                <div>Secondary Skills: <em>${cand.Secondary_Skills}</em></div>
            </div>
        `;
    }

    fetch('/api/candidate-action-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cand)
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success || !data.action_plan) return;
            const plan = data.action_plan;
            const resultsCard = document.getElementById('actionPlanResultsCard');
            if (!resultsCard) return;

            let html = `
            <div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.75rem; margin-bottom: 1rem;">
                <h3 style="color: #f59e0b; font-size: 1.1rem;"><i class="fa-solid fa-triangle-exclamation"></i> Resolution Strategy for ${plan.candidate_name}</h3>
                <p style="font-size: 0.8rem; color: #94a3b8;">Target Applied Role: ${plan.applied_role}</p>
            </div>

            <!-- Identified Skill Gaps -->
            <div style="margin-bottom: 1rem;">
                <h4 style="color: #ef4444; font-size: 0.9rem;"><i class="fa-solid fa-circle-exclamation"></i> Identified Skill / Benchmark Gaps</h4>
                <ul style="font-size: 0.8rem; color: #cbd5e1; margin-top: 4px; padding-left: 1.2rem; line-height: 1.5;">
                    ${plan.identified_gaps.map(g => `<li>${g}</li>`).join('')}
                </ul>
            </div>

            <!-- Path 1: Alternate Role Match -->
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem;">
                <h4 style="color: #10b981; font-size: 0.9rem;"><i class="fa-solid fa-arrows-split-up-and-left"></i> Path 1: Alternate Internal Transfer Recommendation</h4>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    <strong style="color: #38bdf8; font-size: 0.95rem;">${plan.alternate_role_recommendation.Role}</strong>
                    <span class="badge bg-green">${plan.alternate_role_recommendation.Match_Percentage}% Match</span>
                </div>
                <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 2px;">Matched Skills: ${plan.alternate_role_recommendation.Matched_Criteria.join(', ')}</p>
            </div>

            <!-- Path 2: Upskilling -->
            <div style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem;">
                <h4 style="color: #a855f7; font-size: 0.9rem;"><i class="fa-solid fa-graduation-cap"></i> Path 2: Assigned Learning Courses</h4>
                <ul style="font-size: 0.8rem; color: #cbd5e1; margin-top: 4px; padding-left: 1.2rem; line-height: 1.5;">
                    ${plan.recommended_upskilling.map(c => `<li><strong style="color: #c084fc;">${c}</strong></li>`).join('')}
                </ul>
            </div>

            <!-- Path 3: 60-Day PIP Roadmap -->
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem;">
                <h4 style="color: #f59e0b; font-size: 0.9rem;"><i class="fa-solid fa-clock-rotate-left"></i> Path 3: 60-Day PIP Roadmap</h4>
                <div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
                    ${plan.pip_roadmap.map(m => `<div><i class="fa-solid fa-check" style="color: #f59e0b; margin-right: 4px;"></i> ${m}</div>`).join('')}
                </div>
            </div>

            <!-- Path 4: HR Action Execution Panel -->
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.3); padding: 1rem; border-radius: 8px;">
                <h4 style="color: #38bdf8; font-size: 0.95rem; margin-bottom: 0.75rem;"><i class="fa-solid fa-gavel"></i> Take HR Action for ${plan.candidate_name}</h4>
                
                <div id="actionStatusBanner" style="display: none; margin-bottom: 0.75rem; padding: 0.75rem; border-radius: 6px; font-weight: bold; font-size: 0.85rem;"></div>

                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    <button class="btn" style="background: #10b981; color: #fff; font-size: 0.8rem; padding: 0.4rem 0.8rem;" onclick="executeCandidateAction('HIRE_TRANSFER', '${plan.candidate_name}', '${plan.alternate_role_recommendation.Role}')">
                        <i class="fa-solid fa-user-check"></i> Approve Transfer & Hire as ${plan.alternate_role_recommendation.Role}
                    </button>
                    <button class="btn" style="background: #a855f7; color: #fff; font-size: 0.8rem; padding: 0.4rem 0.8rem;" onclick="executeCandidateAction('ENROLL_UPSKILL', '${plan.candidate_name}', '${plan.recommended_upskilling[0]}')">
                        <i class="fa-solid fa-graduation-cap"></i> Enroll in Upskilling Program
                    </button>
                    <button class="btn" style="background: #f59e0b; color: #fff; font-size: 0.8rem; padding: 0.4rem 0.8rem;" onclick="executeCandidateAction('INITIATE_PIP', '${plan.candidate_name}', '${plan.applied_role}')">
                        <i class="fa-solid fa-clipboard-user"></i> Start 60-Day PIP Roadmap
                    </button>
                </div>
            </div>
        `;
            resultsCard.innerHTML = html;
        });
}

function executeCandidateAction(actionType, candidateName, targetDetail) {
    const banner = document.getElementById('actionStatusBanner');
    if (!banner) return;

    banner.style.display = 'block';

    if (actionType === 'HIRE_TRANSFER') {
        banner.style.background = 'rgba(16, 185, 129, 0.2)';
        banner.style.border = '1px solid #10b981';
        banner.style.color = '#34d399';
        banner.innerHTML = `<i class="fa-solid fa-circle-check"></i> ACTION EXECUTED: <strong>${candidateName}</strong> has been officially approved and <strong>HIRED for ${targetDetail}</strong> role!`;
    } else if (actionType === 'ENROLL_UPSKILL') {
        banner.style.background = 'rgba(168, 85, 247, 0.2)';
        banner.style.border = '1px solid #a855f7';
        banner.style.color = '#c084fc';
        banner.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ACTION EXECUTED: Enrolled <strong>${candidateName}</strong> into <strong>${targetDetail}</strong> upskilling module!`;
    } else if (actionType === 'INITIATE_PIP') {
        banner.style.background = 'rgba(245, 158, 11, 0.2)';
        banner.style.border = '1px solid #f59e0b';
        banner.style.color = '#fbbf24';
        banner.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> ACTION EXECUTED: Assigned mentor and initiated 60-Day PIP Roadmap for <strong>${candidateName}</strong> (${targetDetail})!`;
    }
}
