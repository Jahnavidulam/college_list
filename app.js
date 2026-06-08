/* ==========================================================================
   EDUSPHERE INDIA - COLLEGES DIRECTORY & ANALYTICS CLIENT CORE
   ========================================================================== */

// Global State
let allColleges = [];
let filteredColleges = [];
let currentPage = 1;
let pageSize = 25;
const visitedCollegeIds = new Set();
let activeModalCollegeId = null;
let redditPresenceByCollegeId = {};

const VISITED_STORAGE_KEY = "visited_college_ids";
const FILTERS_STORAGE_KEY = "college_directory_filters";
const REDDIT_STORAGE_KEY = "college_reddit_presence";

// Charts instances
let statesChart = null;
let classificationChart = null;

// DOM Elements
const sectionDashboard = document.getElementById("section-dashboard");
const sectionDirectory = document.getElementById("section-directory");
const btnNavDashboard = document.getElementById("btn-nav-dashboard");
const btnNavDirectory = document.getElementById("btn-nav-directory");

const statTotalColleges = document.getElementById("stat-total-colleges");
const statTotalBranches = document.getElementById("stat-total-branches");
const statTotalSeats = document.getElementById("stat-total-seats");
const statTier1 = document.getElementById("stat-tier-1");

const searchGlobal = document.getElementById("search-global");
const filterState = document.getElementById("filter-state");
const filterDistrict = document.getElementById("filter-district");
const filterBranch = document.getElementById("filter-branch");
const filterTier = document.getElementById("filter-tier");
const filterType = document.getElementById("filter-type");
const filterVisited = document.getElementById("filter-visited");
const filterReddit = document.getElementById("filter-reddit");
const btnResetFilters = document.getElementById("btn-reset-filters");

const resultsCount = document.getElementById("results-count");
const tableBody = document.getElementById("table-body");
const selectPageSize = document.getElementById("select-page-size");
const btnPagePrev = document.getElementById("btn-page-prev");
const btnPageNext = document.getElementById("btn-page-next");
const pageStatusText = document.getElementById("page-status-text");

const modal = document.getElementById("college-details-modal");
const btnCloseModal = document.getElementById("btn-close-modal");
const modalRedditStatus = document.getElementById("modal-reddit-status");
const modalRedditActivity = document.getElementById("modal-reddit-activity");
const modalRedditSubreddit = document.getElementById("modal-reddit-subreddit");
const modalRedditMembers = document.getElementById("modal-reddit-members");
const modalRedditLastActive = document.getElementById("modal-reddit-last-active");
const modalRedditLink = document.getElementById("modal-reddit-link");
const modalLinkRedditSearch = document.getElementById("modal-link-reddit-search");
const modalLinkRedditDirect = document.getElementById("modal-link-reddit-direct");
const btnSaveRedditPresence = document.getElementById("btn-save-reddit-presence");

// Export Actions
const btnExportJson = document.getElementById("btn-export-json");
const btnExportCsv = document.getElementById("btn-export-csv");

/* ==========================================================================
   INITIALIZATION & DATA LOADING
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    loadVisitedColleges();
    loadRedditPresence();

    // Set Live Clock Year
    document.getElementById("live-time").innerText = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    
    // View Routing
    btnNavDashboard.addEventListener("click", (e) => {
        e.preventDefault();
        routeView("dashboard");
    });
    btnNavDirectory.addEventListener("click", (e) => {
        e.preventDefault();
        routeView("directory");
    });
    
    // Load Database JSON
    fetch("colleges_db.json")
        .then(response => {
            if (!response.ok) throw new Error("Database JSON not found!");
            return response.json();
        })
        .then(data => {
            allColleges = data;
            filteredColleges = [...allColleges];
            
            // Populating filter drop-downs
            populateFilterOptions();

            // Restore saved directory preferences
            applySavedDirectoryPreferences();
            
            // Render dashboard charts and metrics
            updateDashboardMetrics();
            initCharts();
            
            // Render college data table
            renderTable();
            
            // Setup Event Listeners
            setupEventListeners();
        })
        .catch(err => {
            console.error("Error loading colleges database:", err);
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: hsl(0,100%,60%);">Failed to load directory database: ${err.message}</td></tr>`;
        });
});

function routeView(view) {
    if (view === "dashboard") {
        btnNavDashboard.classList.add("active");
        btnNavDirectory.classList.remove("active");
        sectionDashboard.classList.add("active");
        sectionDirectory.classList.remove("active");
    } else {
        btnNavDashboard.classList.remove("active");
        btnNavDirectory.classList.add("active");
        sectionDashboard.classList.remove("active");
        sectionDirectory.classList.add("active");
    }
}

/* ==========================================================================
   DYNAMIC DROPDOWN POPULATION
   ========================================================================== */
function populateFilterOptions() {
    const states = new Set();
    const branches = new Set();
    
    allColleges.forEach(col => {
        if (col.state) states.add(col.state);
        if (col.branches) {
            col.branches.forEach(b => {
                if (b.branch_name) branches.add(b.branch_name);
            });
        }
    });
    
    // Populate States Dropdown
    Array.from(states).sort().forEach(state => {
        const opt = document.createElement("option");
        opt.value = state;
        opt.textContent = state;
        filterState.appendChild(opt);
    });
    
    // Populate Branches Dropdown
    Array.from(branches).sort().forEach(branch => {
        const opt = document.createElement("option");
        opt.value = branch;
        opt.textContent = branch;
        filterBranch.appendChild(opt);
    });
}

function handleStateChange() {
    const selectedState = filterState.value;
    filterDistrict.innerHTML = '<option value="">All Districts</option>';
    
    if (!selectedState) {
        filterDistrict.disabled = true;
        filterDistrict.innerHTML = '<option value="">Select State First</option>';
        return;
    }
    
    // Get unique districts for selected state
    const districts = new Set();
    allColleges.forEach(col => {
        if (col.state === selectedState && col.district) {
            districts.add(col.district);
        }
    });
    
    Array.from(districts).sort().forEach(dist => {
        const opt = document.createElement("option");
        opt.value = dist;
        opt.textContent = dist;
        filterDistrict.appendChild(opt);
    });
    
    filterDistrict.disabled = false;
}

function loadVisitedColleges() {
    const localData = localStorage.getItem(VISITED_STORAGE_KEY);
    if (!localData) return;

    try {
        const parsedIds = JSON.parse(localData);
        if (!Array.isArray(parsedIds)) return;

        visitedCollegeIds.clear();
        parsedIds.forEach(id => {
            if (id) visitedCollegeIds.add(id);
        });
    } catch (error) {
        console.error("Error parsing visited colleges from localStorage:", error);
    }
}

function loadRedditPresence() {
    const localData = localStorage.getItem(REDDIT_STORAGE_KEY);
    if (!localData) return;

    try {
        const parsed = JSON.parse(localData);
        if (parsed && typeof parsed === "object") {
            redditPresenceByCollegeId = parsed;
        }
    } catch (error) {
        console.error("Error parsing Reddit presence from localStorage:", error);
    }
}

function saveRedditPresence() {
    localStorage.setItem(REDDIT_STORAGE_KEY, JSON.stringify(redditPresenceByCollegeId));
}

function getDefaultRedditPresence() {
    return {
        status: "unknown",
        subredditName: "",
        memberCount: "",
        activityLevel: "",
        lastActiveDate: "",
        link: ""
    };
}

function getCollegeRedditPresence(collegeId) {
    return {
        ...getDefaultRedditPresence(),
        ...(redditPresenceByCollegeId[collegeId] || {})
    };
}

function setCollegeRedditPresence(collegeId, presence) {
    if (!collegeId) return;

    redditPresenceByCollegeId[collegeId] = {
        status: presence.status || "unknown",
        subredditName: presence.subredditName || "",
        memberCount: presence.memberCount || "",
        activityLevel: presence.activityLevel || "",
        lastActiveDate: presence.lastActiveDate || "",
        link: presence.link || ""
    };

    saveRedditPresence();
}

function getRedditStatusMeta(status) {
    if (status === "active") {
        return { label: "Active Reddit Community", symbol: "🟢", className: "reddit-status-active" };
    }

    if (status === "discussions") {
        return { label: "Reddit Discussions Found", symbol: "🟡", className: "reddit-status-discussions" };
    }

    if (status === "none") {
        return { label: "No Reddit Presence Found", symbol: "🔴", className: "reddit-status-none" };
    }

    return { label: "Reddit Presence Not Reviewed", symbol: "⚪", className: "reddit-status-unknown" };
}

function getCollegeRedditSearchUrl(college) {
    const query = [college.college_name, college.city || college.district, college.state, "reddit"]
        .filter(Boolean)
        .join(" ");

    return `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&sort=new`;
}

function getCollegeRedditUrl(college) {
    const presence = getCollegeRedditPresence(college.college_id);
    return presence.link || getCollegeRedditSearchUrl(college);
}

function formatRedditMemberCount(memberCount) {
    if (!memberCount) return "Members not recorded";

    const numericValue = Number(memberCount);
    return Number.isFinite(numericValue) ? `${numericValue.toLocaleString()} members` : `${memberCount} members`;
}

function formatRedditActivity(presence) {
    const fragments = [];
    if (presence.activityLevel) fragments.push(`${presence.activityLevel} activity`);
    if (presence.lastActiveDate) fragments.push(`Last active ${presence.lastActiveDate}`);
    return fragments.length > 0 ? fragments.join(" • ") : "Activity not recorded";
}

function saveRedditPresenceFromModal() {
    if (!activeModalCollegeId) return;

    setCollegeRedditPresence(activeModalCollegeId, {
        status: modalRedditStatus.value,
        subredditName: modalRedditSubreddit.value.trim(),
        memberCount: modalRedditMembers.value.trim(),
        activityLevel: modalRedditActivity.value,
        lastActiveDate: modalRedditLastActive.value,
        link: modalRedditLink.value.trim()
    });

    filterData();
}

function saveVisitedColleges() {
    localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(Array.from(visitedCollegeIds)));
}

function isCollegeVisited(collegeId) {
    return visitedCollegeIds.has(collegeId);
}

function toggleCollegeVisited(collegeId, isVisited) {
    if (!collegeId) return;

    if (isVisited) visitedCollegeIds.add(collegeId);
    else visitedCollegeIds.delete(collegeId);

    saveVisitedColleges();
    renderTable();
}

function getCurrentDirectoryPreferences() {
    return {
        search: searchGlobal.value,
        state: filterState.value,
        district: filterDistrict.value,
        branch: filterBranch.value,
        tier: filterTier.value,
        type: filterType.value,
        visited: filterVisited.value,
        reddit: filterReddit.value,
        pageSize: selectPageSize.value
    };
}

function saveDirectoryPreferences() {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(getCurrentDirectoryPreferences()));
}

function applySavedDirectoryPreferences() {
    const localData = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!localData) return;

    try {
        const saved = JSON.parse(localData);
        if (!saved || typeof saved !== "object") return;

        searchGlobal.value = saved.search || "";
        filterState.value = saved.state || "";
        handleStateChange();
        filterDistrict.value = saved.district || "";
        filterBranch.value = saved.branch || "";
        filterTier.value = saved.tier || "";
        filterType.value = saved.type || "";
        filterVisited.value = saved.visited || "";
        filterReddit.value = saved.reddit || "";

        if (saved.pageSize && Array.from(selectPageSize.options).some(option => option.value === saved.pageSize)) {
            selectPageSize.value = saved.pageSize;
            pageSize = parseInt(saved.pageSize, 10);
        }

        filterData();
    } catch (error) {
        console.error("Error parsing saved directory preferences:", error);
    }
}

function clearDirectoryPreferences() {
    localStorage.removeItem(FILTERS_STORAGE_KEY);
}

/* ==========================================================================
   METRICS & CHARTS COMPUTATION
   ========================================================================== */
function updateDashboardMetrics() {
    statTotalColleges.innerText = filteredColleges.length.toLocaleString();
    
    // Find unique branches and sum seats for filtered set
    const branches = new Set();
    let totalSeats = 0;
    let tier1Count = 0;
    
    filteredColleges.forEach(col => {
        totalSeats += (col.total_intake || 0);
        if (col.tier === "Tier 1") tier1Count++;
        
        if (col.branches) {
            col.branches.forEach(b => {
                if (b.branch_name) branches.add(b.branch_name);
            });
        }
    });
    
    statTotalBranches.innerText = branches.size.toLocaleString();
    statTotalSeats.innerText = totalSeats.toLocaleString();
    statTier1.innerText = tier1Count.toLocaleString();
}

function initCharts() {
    // 1. Colleges by State (Top 8 States)
    const stateCounts = {};
    filteredColleges.forEach(col => {
        stateCounts[col.state] = (stateCounts[col.state] || 0) + 1;
    });
    
    const sortedStates = Object.entries(stateCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
        
    const stateLabels = sortedStates.map(x => x[0]);
    const stateData = sortedStates.map(x => x[1]);
    
    const ctxStates = document.getElementById("chart-states").getContext("2d");
    if (statesChart) statesChart.destroy();
    
    statesChart = new Chart(ctxStates, {
        type: 'bar',
        data: {
            labels: stateLabels,
            datasets: [{
                label: 'Colleges Count',
                data: stateData,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1'
                }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
    
    // 2. Institution Type Distribution (Government vs Private)
    let govCount = 0;
    let pvtCount = 0;
    filteredColleges.forEach(col => {
        if (col.type === "Government") govCount++;
        else pvtCount++;
    });
    
    const ctxClassification = document.getElementById("chart-classification").getContext("2d");
    if (classificationChart) classificationChart.destroy();
    
    classificationChart = new Chart(ctxClassification, {
        type: 'doughnut',
        data: {
            labels: ['Government', 'Private'],
            datasets: [{
                data: [govCount, pvtCount],
                backgroundColor: [
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(153, 102, 255, 0.6)'
                ],
                borderColor: [
                    'rgba(54, 162, 235, 1)',
                    'rgba(153, 102, 255, 1)'
                ],
                borderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e2e8f0', font: { family: 'Inter', size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1'
                }
            },
            cutout: '70%'
        }
    });
}

/* ==========================================================================
   FILTERING CONTROLLER
   ========================================================================== */
function filterData() {
    const searchVal = searchGlobal.value.toLowerCase().trim();
    const stateVal = filterState.value;
    const districtVal = filterDistrict.value;
    const branchVal = filterBranch.value;
    const tierVal = filterTier.value;
    const typeVal = filterType.value;
    const visitedVal = filterVisited.value;
    const redditVal = filterReddit.value;
    
    filteredColleges = allColleges.filter(col => {
        // Global Fuzzy Search
        if (searchVal) {
            const nameMatch = col.college_name.toLowerCase().includes(searchVal);
            const uniMatch = col.affiliated_university && col.affiliated_university.toLowerCase().includes(searchVal);
            const addressMatch = col.address && col.address.toLowerCase().includes(searchVal);
            const cityMatch = col.city && col.city.toLowerCase().includes(searchVal);
            const districtMatch = col.district && col.district.toLowerCase().includes(searchVal);
            
            if (!nameMatch && !uniMatch && !addressMatch && !cityMatch && !districtMatch) {
                return false;
            }
        }
        
        // State Filter
        if (stateVal && col.state !== stateVal) return false;
        
        // District Filter
        if (districtVal && col.district !== districtVal) return false;
        
        // Tier Filter
        if (tierVal && col.tier !== tierVal) return false;
        
        // Type Filter
        if (typeVal && col.type !== typeVal) return false;
        
        // Branch Filter (must offer selected branch stream)
        if (branchVal) {
            if (!col.branches) return false;
            const hasBranch = col.branches.some(b => b.branch_name === branchVal);
            if (!hasBranch) return false;
        }

        // Review Status Filter
        if (visitedVal === "visited" && !isCollegeVisited(col.college_id)) return false;
        if (visitedVal === "unvisited" && isCollegeVisited(col.college_id)) return false;

        // Reddit Presence Filter
        if (redditVal) {
            const redditPresence = getCollegeRedditPresence(col.college_id);
            if (redditPresence.status !== redditVal) return false;
        }
        
        return true;
    });
    
    currentPage = 1;
    saveDirectoryPreferences();
    updateDashboardMetrics();
    initCharts();
    renderTable();
}

function resetFilters() {
    searchGlobal.value = "";
    filterState.value = "";
    filterDistrict.value = "";
    filterDistrict.disabled = true;
    filterBranch.value = "";
    filterTier.value = "";
    filterType.value = "";
    filterVisited.value = "";
    filterReddit.value = "";
    clearDirectoryPreferences();
    
    filteredColleges = [...allColleges];
    currentPage = 1;
    updateDashboardMetrics();
    initCharts();
    renderTable();
}

/* ==========================================================================
   DATAGRID RENDERER & PAGINATION
   ========================================================================== */
function renderTable() {
    resultsCount.innerText = filteredColleges.length.toLocaleString();
    tableBody.innerHTML = "";
    
    if (filteredColleges.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No engineering colleges matched your filter criteria.</td></tr>';
        pageStatusText.innerText = "Page 0 of 0";
        btnPagePrev.disabled = true;
        btnPageNext.disabled = true;
        return;
    }
    
    // Pagination slicing
    const totalPages = Math.ceil(filteredColleges.length / pageSize);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredColleges.length);
    
    const paginatedItems = filteredColleges.slice(startIndex, endIndex);
    
    paginatedItems.forEach(col => {
        const tr = document.createElement("tr");
        const visited = isCollegeVisited(col.college_id);
        const redditPresence = getCollegeRedditPresence(col.college_id);
        const redditMeta = getRedditStatusMeta(redditPresence.status);
        tr.classList.toggle("visited-row", visited);
        
        // Classification Badges
        const tierClass = col.tier.toLowerCase().replace(" ", "-");
        const tierBadge = `<span class="badge-tier ${tierClass}">${col.tier}</span>`;
        
        const rankText = col.nirf_rank ? `<span class="accred-mini-badge rank-badge">NIRF: ${col.nirf_rank}</span>` : "";
        const naacText = col.naac_grade ? `<span class="accred-mini-badge">NAAC: ${col.naac_grade}</span>` : "";
        
        const streamsCount = col.branches ? col.branches.length : 0;
        
        tr.innerHTML = `
            <td>
                <div class="college-cell">
                    <div class="college-name-row">
                        <span class="college-cell-name">${col.college_name}</span>
                        <label class="visited-toggle ${visited ? 'is-visited' : ''}" title="Mark college as visited">
                            <input type="checkbox" class="visited-checkbox" data-college-id="${col.college_id}" ${visited ? 'checked' : ''}>
                            <span class="visited-toggle-indicator">${visited ? '✓' : ''}</span>
                        </label>
                    </div>
                    <span class="college-cell-uni">${col.affiliated_university || 'Autonomous Institution'}</span>
                    <div class="reddit-presence-row">
                        <span class="reddit-status-pill ${redditMeta.className}">${redditMeta.symbol} ${redditMeta.label}</span>
                        <a href="${getCollegeRedditUrl(col)}" class="reddit-inline-link" target="_blank" rel="noreferrer">Open Reddit</a>
                    </div>
                </div>
            </td>
            <td>
                <div class="college-cell">
                    <span>${col.city || col.district}</span>
                    <span class="college-cell-uni" style="font-size: 11px;">${col.state}</span>
                </div>
            </td>
            <td>
                <div class="college-cell">
                    ${tierBadge}
                    <span class="type-text">${col.type}</span>
                </div>
            </td>
            <td>
                <div class="accred-badge-row">
                    ${rankText}
                    ${naacText}
                </div>
            </td>
            <td class="text-center" style="font-weight: 700;">${col.total_intake ? col.total_intake.toLocaleString() : 'N/A'}</td>
            <td class="text-center" style="font-weight: 500;">${streamsCount} Streams</td>
            <td class="text-center">
                <button class="btn-details" onclick="openCollegeDetails('${col.college_id}')" title="View College Details">
                    <i class="fa-solid fa-arrow-right"></i>
                </button>
            </td>
        `;
        
        tableBody.appendChild(tr);
    });
    
    // Update pagination controls status
    pageStatusText.innerText = `Page ${currentPage} of ${totalPages}`;
    btnPagePrev.disabled = (currentPage === 1);
    btnPageNext.disabled = (currentPage === totalPages);
}

/* ==========================================================================
   MODAL DIALOG CONTROLLER (College Profile Details)
   ========================================================================== */
function openCollegeDetails(collegeId) {
    const col = allColleges.find(x => x.college_id === collegeId);
    if (!col) return;
    const redditPresence = getCollegeRedditPresence(collegeId);
    activeModalCollegeId = collegeId;
    
    // Basic Profile
    document.getElementById("modal-name").innerText = col.college_name;
    document.getElementById("modal-university").innerText = col.affiliated_university || "Autonomous Institution";
    document.getElementById("modal-location").innerText = `${col.city || col.district}, ${col.state} - ${col.pincode}`;
    
    const tierBadge = document.getElementById("modal-tier-badge");
    tierBadge.innerText = col.tier;
    tierBadge.className = `modal-badge badge-tier ${col.tier.toLowerCase().replace(" ", "-")}`;
    
    // General info
    document.getElementById("modal-est-year").innerText = col.est_year || "N/A";
    document.getElementById("modal-type").innerText = col.type || "Private";
    document.getElementById("modal-aicte-id").innerText = col.aicte_id || "N/A";
    document.getElementById("modal-ugc-id").innerText = col.ugc_id || "N/A";
    
    // Accreditations
    document.getElementById("modal-nirf").innerText = col.nirf_rank || "N/A";
    document.getElementById("modal-naac").innerText = col.naac_grade || "Not Accredited";
    document.getElementById("modal-nba").innerText = col.nba_accreditation || "No";
    document.getElementById("modal-aicte-status").innerText = col.aicte_status || "Approved";
    
    // Infrastructure
    document.getElementById("modal-campus").innerText = col.campus_type || "Urban";
    document.getElementById("modal-hostel").innerText = col.hostel_available || "Yes";
    document.getElementById("modal-placement").innerText = col.placement_cell || "Yes";
    
    // Contact Info Links
    const webLink = document.getElementById("modal-link-web");
    webLink.href = col.website;
    webLink.innerText = `Visit ${col.website.replace("http://www.", "").replace("https://www.", "")}`;
    
    const emailLink = document.getElementById("modal-link-email");
    emailLink.href = `mailto:${col.email}`;
    emailLink.innerText = col.email;
    
    const admLink = document.getElementById("modal-link-admission");
    admLink.href = `mailto:${col.admission_email}`;
    admLink.innerText = col.admission_email;
    
    const plcLink = document.getElementById("modal-link-placement");
    plcLink.href = `mailto:${col.placement_email}`;
    plcLink.innerText = col.placement_email;

    modalRedditStatus.value = redditPresence.status;
    modalRedditActivity.value = redditPresence.activityLevel;
    modalRedditSubreddit.value = redditPresence.subredditName;
    modalRedditMembers.value = redditPresence.memberCount;
    modalRedditLastActive.value = redditPresence.lastActiveDate;
    modalRedditLink.value = redditPresence.link;
    modalLinkRedditSearch.href = getCollegeRedditSearchUrl(col);
    modalLinkRedditDirect.href = getCollegeRedditUrl(col);
    modalLinkRedditDirect.style.pointerEvents = redditPresence.link ? "auto" : "none";
    modalLinkRedditDirect.style.opacity = redditPresence.link ? "1" : "0.5";
    
    document.getElementById("modal-phone").innerText = col.phone || "N/A";
    document.getElementById("modal-full-address").innerText = `${col.address}, Pincode: ${col.pincode}`;
    
    // Nested branches table population
    const branchesBody = document.getElementById("modal-branches-body");
    branchesBody.innerHTML = "";
    
    if (col.branches && col.branches.length > 0) {
        col.branches.forEach(b => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight: 600;">${b.branch_name}</td>
                <td><span class="accred-mini-badge">${b.degree_type}</span></td>
                <td class="text-right" style="font-weight: 700; color: var(--accent-cyan);">${b.branch_intake.toLocaleString()}</td>
            `;
            branchesBody.appendChild(tr);
        });
    } else {
        branchesBody.innerHTML = '<tr><td colspan="3" class="text-center">No branch courses listed for this college.</td></tr>';
    }
    
    document.getElementById("modal-total-intake").innerText = (col.total_intake || 0).toLocaleString();
    
    // Display Modal
    modal.classList.add("active");
}

window.openCollegeDetails = openCollegeDetails; // Make it globally accessible for onClick in rows

function closeModal() {
    activeModalCollegeId = null;
    modal.classList.remove("active");
}

/* ==========================================================================
   DATA EXPORT UTILITIES (CSV / JSON)
   ========================================================================== */
function exportFilteredJSON() {
    const jsonStr = JSON.stringify(filteredColleges, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "edusphere_filtered_colleges.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportFilteredCSV() {
    // Generate a flat branch-wise CSV representation of current filtered subset.
    const headers = [
        "College ID", "College Name", "State", "District", "City",
        "College Type", "Affiliated University", "Tier", "NIRF Rank", "NAAC Grade",
        "Official Website", "Official Email", "Admission Email", "Placement Email", "Phone",
        "Engineering Branch Name", "Degree Type", "Branch Intake Capacity", "Total Intake Capacity", "Establishment Year"
    ];
    
    let csvRows = [headers.join(",")];
    
    filteredColleges.forEach(col => {
        if (!col.branches || col.branches.length === 0) return;
        
        col.branches.forEach(b => {
            const row = [
                `"${col.college_id}"`,
                `"${col.college_name.replace(/"/g, '""')}"`,
                `"${col.state}"`,
                `"${col.district}"`,
                `"${col.city}"`,
                `"${col.type}"`,
                `"${(col.affiliated_university || "Autonomous").replace(/"/g, '""')}"`,
                `"${col.tier}"`,
                `"${col.nirf_rank || ""}"`,
                `"${col.naac_grade || ""}"`,
                `"${col.website}"`,
                `"${col.email}"`,
                `"${col.admission_email}"`,
                `"${col.placement_email}"`,
                `"${col.phone}"`,
                `"${b.branch_name}"`,
                `"${b.degree_type}"`,
                b.branch_intake,
                col.total_intake,
                col.est_year
            ];
            
            csvRows.push(row.join(","));
        });
    });
    
    const csvStr = csvRows.join("\n");
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "edusphere_filtered_colleges.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ==========================================================================
   EVENT HANDLERS
   ========================================================================== */
function setupEventListeners() {
    // Dropdown filters
    filterState.addEventListener("change", () => {
        handleStateChange();
        filterData();
    });
    filterDistrict.addEventListener("change", filterData);
    filterBranch.addEventListener("change", filterData);
    filterTier.addEventListener("change", filterData);
    filterType.addEventListener("change", filterData);
    filterVisited.addEventListener("change", filterData);
    filterReddit.addEventListener("change", filterData);
    
    // Global Fuzzy Search Debounce
    let searchTimeout = null;
    searchGlobal.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(filterData, 300);
    });
    
    // Reset Filters button
    btnResetFilters.addEventListener("click", resetFilters);
    
    // Pagination size and buttons
    selectPageSize.addEventListener("change", () => {
        pageSize = parseInt(selectPageSize.value);
        currentPage = 1;
        saveDirectoryPreferences();
        renderTable();
    });
    
    btnPagePrev.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    
    btnPageNext.addEventListener("click", () => {
        const totalPages = Math.ceil(filteredColleges.length / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
    
    // Close Modal
    btnCloseModal.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Data exports
    btnExportJson.addEventListener("click", exportFilteredJSON);
    btnExportCsv.addEventListener("click", exportFilteredCSV);
    btnSaveRedditPresence.addEventListener("click", saveRedditPresenceFromModal);

    tableBody.addEventListener("change", (event) => {
        const checkbox = event.target.closest(".visited-checkbox");
        if (!checkbox) return;

        toggleCollegeVisited(checkbox.dataset.collegeId, checkbox.checked);
    });
}
