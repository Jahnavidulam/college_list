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
const filterTeam = document.getElementById("filter-team");
const filterPriority = document.getElementById("filter-priority");
const filterYear = document.getElementById("filter-year");
const btnResetFilters = document.getElementById("btn-reset-filters");
const teamSummaryGrid = document.getElementById("team-summary-grid");
const validationGrid = document.getElementById("validation-grid");
const modalTeamMember = document.getElementById("modal-team-member");

// Team assignment (loaded from team_assignments.json; computed ONCE by
// pipeline/assign_states.py, never regenerated in the browser — filtering only reads it)
let teamAssignment = null;
const TEAM_HUES = {
    "Arun": 210, "Pankaj": 265, "Hemanth": 320, "Tarun": 350,
    "Venkatesh": 15, "Priyanshu": 40, "Jaydev": 90, "Krishna": 150, "Jahnavi": 185,
    "Kiran": 120
};

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
    
    // Load Database JSON + Team Assignment JSON together
    Promise.all([
        fetch("colleges_db.json").then(r => {
            if (!r.ok) throw new Error("Database JSON not found!");
            return r.json();
        }),
        fetch("team_assignments.json").then(r => {
            if (!r.ok) throw new Error("Team assignment JSON not found!");
            return r.json();
        })
    ])
        .then(([data, assignment]) => {
            teamAssignment = assignment;
            allColleges = data;

            // Merge the pre-computed, fixed-seed assignment onto each college record.
            // The assignment itself is never generated or changed here — this only reads it.
            const priority1States = new Set(assignment.priority1States || []);
            allColleges.forEach(col => {
                const member = assignment.assignments[col.college_id];
                col.team_member = member || "Unassigned";
                col.assignment_status = member ? "Assigned" : "Unassigned";
                col.priority = priority1States.has(col.state) ? 1 : 2;
            });

            // Priority-1 colleges come first everywhere, so each team member works
            // through their Priority-1 states before Priority 2 (stable sort keeps
            // the original order within each priority).
            allColleges.sort((a, b) => a.priority - b.priority);

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

            // Render the team assignment summary + validation (static, computed once)
            renderTeamSummary();
            renderValidation();

            // Setup Event Listeners
            setupEventListeners();
        })
        .catch(err => {
            console.error("Error loading colleges database:", err);
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="color: hsl(0,100%,60%);">Failed to load directory database: ${err.message}</td></tr>`;
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
    
    // Populate States Dropdown, grouped by priority
    const priorityOf = {};
    allColleges.forEach(col => { priorityOf[col.state] = col.priority; });
    [1, 2].forEach(p => {
        const group = document.createElement("optgroup");
        group.label = `Priority ${p} States`;
        Array.from(states).filter(s => priorityOf[s] === p).sort().forEach(state => {
            const opt = document.createElement("option");
            opt.value = state;
            opt.textContent = `${state} (P${p})`;
            group.appendChild(opt);
        });
        if (group.children.length) filterState.appendChild(group);
    });
    
    // Populate Branches Dropdown
    Array.from(branches).sort().forEach(branch => {
        const opt = document.createElement("option");
        opt.value = branch;
        opt.textContent = branch;
        filterBranch.appendChild(opt);
    });
}

/* ==========================================================================
   TEAM ASSIGNMENT: SUMMARY + VALIDATION (static — computed once from the
   state-based assignment file, never recomputed by filtering)
   ========================================================================== */
function renderTeamSummary() {
    if (!teamAssignment) return;
    const plan = teamAssignment.plan || {};
    const rows = teamAssignment.team.map(member => {
        const states = (plan[member] || []).map(p =>
            `<span class="p${p.priority}" title="Priority ${p.priority}${p.partial ? ` · part of state: ${p.districts}` : ""}">${p.state}${p.partial ? "*" : ""} ${p.count}</span>`
        ).join(", ");
        const p1 = (plan[member] || []).filter(p => p.priority === 1).reduce((n, p) => n + p.count, 0);
        const p2 = (plan[member] || []).filter(p => p.priority === 2).reduce((n, p) => n + p.count, 0);
        const split = !states ? "" : !p1
            ? `<span class="states priority-split"><span class="priority-badge p2">P2</span> ${p2} (all Priority 2)</span>`
            : p2
            ? `<span class="states priority-split"><span class="priority-badge p1">P1</span> ${p1} first, then <span class="priority-badge p2">P2</span> ${p2}</span>`
            : `<span class="states priority-split"><span class="priority-badge p1">P1</span> ${p1} (all Priority 1)</span>`;
        return `
            <div class="team-summary-row" data-member="${member}" style="--m-hue:${TEAM_HUES[member]}">
                <span class="dot"></span>
                <span class="name">${member}${states ? `<span class="states">${states}</span>` : ""}${split}<button type="button" class="team-csv-btn" data-member="${member}" title="Download the ${teamAssignment.counts[member].toLocaleString()} colleges assigned to ${member} as a CSV file"><i class="fa-solid fa-file-csv"></i> Download CSV</button><button type="button" class="team-csv-btn team-xlsx-btn" data-member="${member}" title="Download the ${teamAssignment.counts[member].toLocaleString()} colleges assigned to ${member} as an Excel sheet"><i class="fa-solid fa-file-excel"></i> Download Excel</button></span>
                <span class="count">${teamAssignment.counts[member].toLocaleString()}</span>
            </div>`;
    }).join("");

    const totalRow = `
        <div class="team-summary-row total-row" data-member="">
            <span class="dot"></span>
            <span class="name">TOTAL</span>
            <span class="count">${teamAssignment.totalAssigned.toLocaleString()}</span>
        </div>`;

    teamSummaryGrid.innerHTML = rows + totalRow;

    const memberCounts = teamAssignment.team.map(m => teamAssignment.counts[m]);
    const lo = Math.min(...memberCounts), hi = Math.max(...memberCounts);
    const perPerson = lo === hi ? lo.toLocaleString() : `${lo.toLocaleString()}–${hi.toLocaleString()}`;
    document.getElementById("team-per-person").textContent = perPerson;
    document.getElementById("team-split-note").textContent = assignmentGroups().map(g => {
        const total = g.members.reduce((sum, m) => sum + teamAssignment.counts[m], 0);
        const groupCounts = g.members.map(m => teamAssignment.counts[m]);
        const lo = Math.min(...groupCounts), hi = Math.max(...groupCounts);
        const each = lo === hi ? lo.toLocaleString() : `${lo.toLocaleString()}–${hi.toLocaleString()}`;
        return `${g.label}${total.toLocaleString()} colleges across ${g.members.length} members, ${each} each`;
    }).join("; ");

    const p1States = teamAssignment.priority1States || [];
    const p1Count = allColleges.filter(c => c.priority === 1).length;
    const p2Count = allColleges.length - p1Count;
    const p2StateCount = new Set(allColleges.filter(c => c.priority === 2).map(c => c.state)).size;
    document.getElementById("priority-split-note").textContent =
        `Priority 1 (${p1States.length} states, ${p1Count.toLocaleString()} colleges): ${p1States.join(", ")}. ` +
        `Priority 2: the remaining ${p2StateCount} states (${p2Count.toLocaleString()} colleges).`;

    // Per-member CSV download; it must not also trigger the row's filter click.
    teamSummaryGrid.querySelectorAll(".team-csv-btn").forEach(btn => {
        btn.addEventListener("click", (event) => {
            event.stopPropagation();
            if (btn.classList.contains("team-xlsx-btn")) exportTeamMemberXlsx(btn, btn.dataset.member);
            else exportTeamMemberCSV(btn.dataset.member);
        });
    });

    teamSummaryGrid.querySelectorAll(".team-summary-row").forEach(row => {
        row.classList.toggle("active", row.dataset.member === filterTeam.value);
        row.addEventListener("click", () => {
            filterTeam.value = row.dataset.member;
            filterData();
            document.getElementById("section-directory").scrollIntoView({ behavior: "smooth" });
        });
    });
}

// Members are grouped by priority team when the assignment file has one (the
// Priority-1 team splits the Priority-1 colleges, the Priority-2 team the rest).
// Files with an empty priority2Team are one group of everybody.
function assignmentGroups() {
    const p2Team = teamAssignment.priority2Team || [];
    if (!p2Team.length) return [{ label: "", members: teamAssignment.team }];
    return [
        { label: "Priority 1: ", members: teamAssignment.team.filter(m => !p2Team.includes(m)) },
        { label: `Priority 2 (${p2Team.join(", ")}): `, members: p2Team }
    ];
}

function renderValidation() {
    if (!teamAssignment) return;
    const counts = teamAssignment.counts;
    const team = teamAssignment.team;

    // Every college record actually carries a team_member value (no blanks).
    const blankCount = allColleges.filter(c => !c.team_member || !team.includes(c.team_member)).length;

    // Duplicate-assignment check: every college_id maps to exactly one member.
    const assignedIds = Object.keys(teamAssignment.assignments);
    const uniqueAssignedIds = new Set(assignedIds);
    const duplicateAssigned = assignedIds.length - uniqueAssignedIds.size;

    // Counts are fair but not forced equal, so each member's stated count must
    // match the colleges actually assigned to them (and be non-zero).
    const actualPerMember = {};
    Object.values(teamAssignment.assignments).forEach(m => { actualPerMember[m] = (actualPerMember[m] || 0) + 1; });
    const perMemberChecks = team.map(m => counts[m] > 0 && counts[m] === actualPerMember[m]);
    const perMemberOk = perMemberChecks.every(Boolean);
    const countsSum = team.reduce((sum, m) => sum + counts[m], 0);
    const totalAssignedOk = teamAssignment.totalAssigned === countsSum && countsSum === teamAssignment.totalColleges;
    const noUnassignedOk = teamAssignment.totalUnassigned === 0 && blankCount === 0;
    const noDuplicatesOk = duplicateAssigned === 0;
    const totalCollegesOk = teamAssignment.totalColleges === allColleges.length;

    const overallPass = perMemberOk && totalAssignedOk && noUnassignedOk && noDuplicatesOk && totalCollegesOk;

    const checks = [
        ["Total colleges", teamAssignment.totalColleges.toLocaleString(), totalCollegesOk],
        ["Total assigned colleges", teamAssignment.totalAssigned.toLocaleString(), totalAssignedOk],
        ...team.map((m, i) => [m, counts[m].toLocaleString(), perMemberChecks[i]]),
        ["Unassigned colleges", teamAssignment.totalUnassigned.toLocaleString(), noUnassignedOk],
        ["Duplicate assignments", duplicateAssigned.toLocaleString(), noDuplicatesOk],
        [`Reconciliation: sum of ${team.length} members`, `${countsSum.toLocaleString()} of ${teamAssignment.totalColleges.toLocaleString()}`, totalAssignedOk],
        ["Assignment validation", overallPass ? "PASS" : "FAIL", overallPass]
    ];

    validationGrid.innerHTML = checks.map(([label, val, pass]) => `
        <div class="validation-check ${pass ? "" : "fail"}">
            <span class="mark">${pass ? "✓" : "!"}</span>
            <span class="label">${label}</span>
            <span class="val">${val}</span>
        </div>
    `).join("");
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
    // localStorage can throw (sandboxed iframe, private browsing, blocked site data) —
    // this feature is a convenience, so it degrades silently rather than halting the app.
    try {
        const localData = localStorage.getItem(VISITED_STORAGE_KEY);
        if (!localData) return;

        const parsedIds = JSON.parse(localData);
        if (!Array.isArray(parsedIds)) return;

        visitedCollegeIds.clear();
        parsedIds.forEach(id => {
            if (id) visitedCollegeIds.add(id);
        });
    } catch (error) {
        console.error("Error reading visited colleges from localStorage:", error);
    }
}

function loadRedditPresence() {
    try {
        const localData = localStorage.getItem(REDDIT_STORAGE_KEY);
        if (!localData) return;

        const parsed = JSON.parse(localData);
        if (parsed && typeof parsed === "object") {
            redditPresenceByCollegeId = parsed;
        }
    } catch (error) {
        console.error("Error reading Reddit presence from localStorage:", error);
    }
}

function saveRedditPresence() {
    try {
        localStorage.setItem(REDDIT_STORAGE_KEY, JSON.stringify(redditPresenceByCollegeId));
    } catch (error) {
        console.error("Error saving Reddit presence to localStorage:", error);
    }
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
    try {
        localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(Array.from(visitedCollegeIds)));
    } catch (error) {
        console.error("Error saving visited colleges to localStorage:", error);
    }
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
        team: filterTeam.value,
        priority: filterPriority.value,
        year: filterYear.value,
        pageSize: selectPageSize.value
    };
}

function saveDirectoryPreferences() {
    try {
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(getCurrentDirectoryPreferences()));
    } catch (error) {
        console.error("Error saving directory preferences to localStorage:", error);
    }
}

function applySavedDirectoryPreferences() {
    try {
        const localData = localStorage.getItem(FILTERS_STORAGE_KEY);
        if (!localData) return;

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
        filterTeam.value = saved.team || "";
        filterPriority.value = saved.priority || "";
        filterYear.value = saved.year || "";

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
    try {
        localStorage.removeItem(FILTERS_STORAGE_KEY);
    } catch (error) {
        console.error("Error clearing directory preferences from localStorage:", error);
    }
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
    const teamVal = filterTeam.value;
    const priorityVal = filterPriority.value;

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

        // Team Member Filter (reads the pre-computed assignment only — never reassigns)
        if (teamVal && col.team_member !== teamVal) return false;

        // State Priority Filter
        if (priorityVal && String(col.priority) !== priorityVal) return false;

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
    filterTeam.value = "";
    filterPriority.value = "";
    filterYear.value = "";
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
// The Year picked in the directory filters, shown next to each college name
// ("College Name — Year 2"). It labels the colleges; it doesn't filter them.
function getSelectedYearLabel() {
    return filterYear.value ? `Year ${filterYear.value}` : "";
}

// Clicking a college name opens LinkedIn's own people search in a new tab
// (LinkedIn stays a separate app). The search carries the college name and,
// when a Year is selected, the year as students write it ("3rd year").
const YEAR_ORDINALS = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th" };

function getLinkedinStudentSearchKeywords(college) {
    const year = YEAR_ORDINALS[filterYear.value];
    return year ? `${college.college_name} ${year} year` : college.college_name;
}

function getLinkedinStudentSearchUrl(college) {
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(getLinkedinStudentSearchKeywords(college))}&origin=GLOBAL_SEARCH_HEADER`;
}

function renderTable() {
    resultsCount.innerText = filteredColleges.length.toLocaleString();
    tableBody.innerHTML = "";
    
    if (filteredColleges.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No engineering colleges matched your filter criteria.</td></tr>';
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

        const isAssigned = col.assignment_status === "Assigned";
        const teamPill = isAssigned
            ? `<span class="team-pill" style="--m-hue:${TEAM_HUES[col.team_member]}"><span class="dot"></span>${col.team_member}</span>`
            : `<span class="team-pill unassigned"><span class="dot"></span>Unassigned</span>`;

        tr.innerHTML = `
            <td>
                <div class="college-cell">
                    <div class="college-name-row">
                        <a class="college-cell-name college-linkedin-link" href="${getLinkedinStudentSearchUrl(col)}" target="_blank" rel="noreferrer" title="Search LinkedIn: ${getLinkedinStudentSearchKeywords(col).replace(/"/g, "&quot;")}">${col.college_name}${getSelectedYearLabel() ? ` <span class="year-badge">— ${getSelectedYearLabel()}</span>` : ""}</a>
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
                    <span class="college-cell-uni" style="font-size: 11px;">${col.state} <span class="priority-badge p${col.priority}" title="Priority ${col.priority} state">P${col.priority}</span></span>
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
            <td>${teamPill}</td>
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
    const modalName = document.getElementById("modal-name");
    modalName.textContent = col.college_name;
    if (getSelectedYearLabel()) {
        const yearBadge = document.createElement("span");
        yearBadge.className = "year-badge";
        yearBadge.textContent = ` — ${getSelectedYearLabel()}`;
        modalName.appendChild(yearBadge);
    }
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
    modalTeamMember.innerText = col.assignment_status === "Assigned"
        ? `${col.team_member} (Assigned)`
        : "Unassigned";
    document.getElementById("modal-priority").innerText = `Priority ${col.priority} (${col.state})`;

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

// Inside the claude.ai artifact viewer, plain download links are blocked and
// files must go through the `downloads` capability. On localhost there is no
// window.claude, so everything below falls back to the normal browser download.
let artifactDownloadsPromise = null;
function getArtifactDownloads() {
    if (!(window.claude && typeof window.claude.use === "function")) return Promise.resolve(null);
    if (!artifactDownloadsPromise) {
        artifactDownloadsPromise = window.claude.use("downloads").catch(() => null);
    }
    return artifactDownloadsPromise;
}

function browserDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function saveFile(filename, blob) {
    const downloads = await getArtifactDownloads();
    if (!downloads) {
        browserDownload(filename, blob);
        return;
    }
    try {
        await downloads.save({ filename, data: blob });
    } catch (error) {
        if (error && error.code === "declined") return;
        console.error("Download failed:", error);
        alertDownloadProblem(error);
    }
}

function alertDownloadProblem(error) {
    const msg = error && error.code === "rate_limited"
        ? "A download prompt is already open. Please finish it and try again."
        : "This download isn't available here.";
    console.warn(msg);
    const results = document.getElementById("results-count");
    if (results && results.parentElement) {
        const note = document.createElement("div");
        note.className = "download-note";
        note.textContent = msg;
        results.parentElement.appendChild(note);
        setTimeout(() => note.remove(), 5000);
    }
}

// Master CSV/Excel downloads in the artifact. The 18 MB master CSV is published
// in two parts and joined back into the exact original file; the Excel workbook
// can't be hosted there, so it is built in the browser from that same CSV.
const MASTER_CSV_PARTS = ["india_engineering_colleges.part1.csv", "india_engineering_colleges.part2.csv"];
const XLSX_NUMERIC_COLUMNS = ["Latitude", "Longitude", "NIRF Ranking", "Branch Intake Capacity", "Total Intake Capacity", "Establishment Year"];

// The single-file build (pipeline/build_single_file.js) embeds everything in the
// page and sets this flag; localhost and the claude.ai artifact never set it.
function isSingleFileBuild() {
    return window.EMBEDDED_SINGLE_FILE === true;
}

async function fetchMasterCsvText() {
    if (isSingleFileBuild()) {
        return fetch("india_engineering_colleges.csv").then(r => r.text());
    }
    const parts = await Promise.all(MASTER_CSV_PARTS.map(p => fetch(p).then(r => {
        if (!r.ok) throw new Error(`Could not load ${p}`);
        return r.text();
    })));
    return parts.join("");
}

function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (isSingleFileBuild()) {
        // Embedded (compressed) in the single file; unpacked only when needed.
        return fetch("xlsx.full.min.js").then(r => r.text()).then(code => {
            const s = document.createElement("script");
            s.textContent = code;
            document.head.appendChild(s);
            if (!window.XLSX) throw new Error("Could not load the Excel library");
            return window.XLSX;
        });
    }
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => reject(new Error("Could not load the Excel library"));
        document.head.appendChild(s);
    });
}

async function buildMasterXlsx(csvText) {
    const XLSX = await loadSheetJs();
    const parsed = XLSX.read(csvText, { type: "string", raw: true });
    const rows = XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], { header: 1, raw: true, defval: "" });
    const header = rows[0];
    const numericIdx = header.map((h, i) => XLSX_NUMERIC_COLUMNS.includes(h) ? i : -1).filter(i => i >= 0);
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        numericIdx.forEach(i => {
            const v = row[i];
            row[i] = v === "" ? null : (isNaN(Number(v)) ? v : Number(v));
        });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Colleges");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
    return new Blob([out]);
}

function setupMasterDownloads() {
    document.querySelectorAll("a.download-nav").forEach(link => {
        link.addEventListener("click", (event) => {
            // On localhost (no artifact viewer) the link serves the real file as before.
            if (!(window.claude && typeof window.claude.use === "function") && !isSingleFileBuild()) return;
            event.preventDefault();
            const href = link.getAttribute("href");
            const original = link.innerHTML;
            link.classList.add("is-busy");
            link.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing download…';
            (async () => {
                try {
                    const csvText = await fetchMasterCsvText();
                    const blob = href.endsWith(".xlsx")
                        ? await buildMasterXlsx(csvText)
                        : new Blob([csvText], { type: "text/csv" });
                    await saveFile(href, blob);
                } catch (error) {
                    console.error("Master download failed:", error);
                    alertDownloadProblem(error);
                } finally {
                    link.innerHTML = original;
                    link.classList.remove("is-busy");
                }
            })();
        });
    });
}

/* ==========================================================================
   EXTERNAL LINKS INSIDE EMBEDDED VIEWERS
   The claude.ai and easyloops viewers run this page in a sandboxed frame.
   There, new tabs are either blocked outright (easyloops) or inherit the
   sandbox. So inside a viewer, links that can't open are
   offered as a copyable link instead. On localhost nothing changes.
   ========================================================================== */
const IN_EMBEDDED_VIEWER = (() => {
    try { return window.self !== window.top; } catch (error) { return true; }
})();

async function copyTextToClipboard(text) {
    try {
        // Some sandboxes leave this promise pending forever, so don't wait long.
        const copied = await Promise.race([
            navigator.clipboard.writeText(text).then(() => true),
            new Promise(resolve => setTimeout(() => resolve(false), 800))
        ]);
        if (copied) return true;
    } catch (error) {
        // Fall through to the selection-based copy, which works in more sandboxes.
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (error) { ok = false; }
    ta.remove();
    return ok;
}

function showOpenLinkPanel(url) {
    document.querySelector(".open-link-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "open-link-backdrop";
    backdrop.innerHTML = `
        <div class="open-link-panel glass-panel" role="dialog" aria-modal="true" aria-labelledby="open-link-title">
            <h4 id="open-link-title"><i class="fa-solid fa-up-right-from-square"></i> Open link</h4>
            <p>This viewer blocks opening new tabs, so the link is copied for you.
                <strong>Press Ctrl+T, then Ctrl+V and Enter</strong> to open it.</p>
            <input type="text" class="open-link-url" readonly>
            <div class="open-link-actions">
                <button type="button" class="btn-primary open-link-copy"><i class="fa-regular fa-copy"></i> Copy link</button>
                <button type="button" class="btn-secondary open-link-close">Close</button>
            </div>
            <span class="open-link-status" aria-live="polite"></span>
        </div>`;
    const input = backdrop.querySelector(".open-link-url");
    input.value = url;
    const status = backdrop.querySelector(".open-link-status");
    const close = () => backdrop.remove();
    backdrop.querySelector(".open-link-close").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    input.addEventListener("focus", () => input.select());
    backdrop.querySelector(".open-link-copy").addEventListener("click", async () => {
        const ok = await copyTextToClipboard(url);
        status.textContent = ok ? "✓ Link copied — press Ctrl+T, then Ctrl+V and Enter." : "Couldn't copy automatically — select the link above and press Ctrl+C.";
        if (!ok) { input.focus(); input.select(); }
    });
    document.body.appendChild(backdrop);
    input.focus();
    input.select();
    // Copy straight away (this still runs inside the viewer's click), so the
    // viewer only has to open a new tab and paste.
    copyTextToClipboard(url).then(ok => {
        status.textContent = ok ? "✓ Link copied." : "Couldn't copy automatically — press Ctrl+C now (the link is selected), then Ctrl+T and Ctrl+V.";
        if (!ok) { input.focus(); input.select(); }
    });
}

// Fully sandboxed viewers can't open tabs, but a viewer can open the link for
// the page: the easyloops admin app answers this request (see ArtifactFrame.tsx
// in the admin app). Resolves true once the viewer confirms it opened the link.
function askViewerToOpenLink(url) {
    return new Promise(resolve => {
        const id = `open-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const onReply = (event) => {
            const data = event.data;
            if (event.source !== window.parent || !data || data.type !== "artifact:open-link:ack" || data.id !== id) return;
            window.removeEventListener("message", onReply);
            clearTimeout(timer);
            resolve(data.opened === true);
        };
        const timer = setTimeout(() => {
            window.removeEventListener("message", onReply);
            resolve(false);
        }, 700);
        window.addEventListener("message", onReply);
        try {
            window.parent.postMessage({ type: "artifact:open-link", url, id }, "*");
        } catch (error) {
            clearTimeout(timer);
            window.removeEventListener("message", onReply);
            resolve(false);
        }
    });
}

function setupExternalLinkFallback() {
    if (!IN_EMBEDDED_VIEWER) return;
    document.addEventListener("click", (event) => {
        const link = event.target.closest && event.target.closest('a[target="_blank"]');
        if (!link || link.style.pointerEvents === "none") return;
        const href = link.href;
        if (!/^https?:/i.test(href)) return;

        // Viewers that allow new tabs (claude.ai): every link
        // opens normally in a new tab, the same as on localhost.
        if (window.origin !== "null") return;

        event.preventDefault();

        // Fully sandboxed viewers (easyloops): ask the viewer to open the link in a
        // normal tab; failing that, try a new tab ourselves; failing that, copy it.
        askViewerToOpenLink(href).then(opened => {
            if (opened) return;
            const win = window.open(href, "_blank");
            if (win) {
                try { win.opener = null; } catch (error) { /* cross-origin: nothing to clear */ }
                return;
            }
            showOpenLinkPanel(href);
        });
    }, true);
}

function exportFilteredJSON() {
    const jsonStr = JSON.stringify(filteredColleges, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    saveFile("edusphere_filtered_colleges.json", blob);
}

function exportFilteredCSV() {
    // Generate a flat branch-wise CSV representation of current filtered subset.
    const headers = [
        "College ID", "College Name", "State", "District", "City",
        "College Type", "Affiliated University", "Tier", "NIRF Rank", "NAAC Grade",
        "Official Website", "Official Email", "Admission Email", "Placement Email", "Phone",
        "Engineering Branch Name", "Degree Type", "Branch Intake Capacity", "Total Intake Capacity", "Establishment Year",
        "Team Member", "Assignment Status"
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
                col.est_year,
                `"${col.team_member}"`,
                `"${col.assignment_status}"`
            ];
            
            csvRows.push(row.join(","));
        });
    });
    
    const csvStr = csvRows.join("\n");
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    saveFile("edusphere_filtered_colleges.csv", blob);
}

/* One member's assigned colleges, read from the fixed assignment file (never
   reassigned here): one row per college, in the directory's order (Priority 1
   first). UTF-8 BOM + CRLF so Excel opens names with special characters correctly. */
const TEAM_CSV_COLUMNS = [
    ["Team Member", col => col.team_member],
    ["Assignment Status", col => col.assignment_status],
    ["State Priority", col => `Priority ${col.priority}`],
    ["College ID", col => col.college_id],
    ["AICTE ID", col => col.aicte_id],
    ["UGC ID", col => col.ugc_id],
    ["College Name", col => col.college_name],
    ["State", col => col.state],
    ["District", col => col.district],
    ["City", col => col.city],
    ["Address", col => col.address],
    ["Pincode", col => col.pincode],
    ["College Type", col => col.type],
    ["Affiliated University", col => col.affiliated_university || "Autonomous"],
    ["Tier", col => col.tier],
    ["NIRF Rank", col => col.nirf_rank],
    ["NAAC Grade", col => col.naac_grade],
    ["NBA Accreditation", col => col.nba_accreditation],
    ["Establishment Year", col => col.est_year],
    ["Total Intake Capacity", col => col.total_intake],
    ["Branch Streams", col => (col.branches || []).length],
    ["Engineering Branches", col => (col.branches || []).map(b => b.branch_name).join("; ")],
    ["Official Website", col => col.website],
    ["Official Email", col => col.email],
    ["Admission Email", col => col.admission_email],
    ["Placement Email", col => col.placement_email],
    ["Phone", col => col.phone],
    ["Visited", col => isCollegeVisited(col.college_id) ? "Yes" : "No"]
];

function csvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function getTeamMemberColleges(member) {
    const seen = new Set();
    return allColleges.filter(col => {
        if (col.team_member !== member || seen.has(col.college_id)) return false;
        seen.add(col.college_id);
        return true;
    });
}

function buildTeamMemberCSV(member) {
    const colleges = getTeamMemberColleges(member);
    const lines = [TEAM_CSV_COLUMNS.map(([header]) => csvCell(header)).join(",")];
    colleges.forEach(col => lines.push(TEAM_CSV_COLUMNS.map(([, get]) => csvCell(get(col))).join(",")));
    return { colleges, text: String.fromCharCode(0xFEFF) + lines.join("\r\n") + "\r\n" };
}

function exportTeamMemberCSV(member) {
    const { colleges, text } = buildTeamMemberCSV(member);
    const expected = teamAssignment && teamAssignment.counts ? teamAssignment.counts[member] : colleges.length;
    if (colleges.length !== expected) {
        console.warn(`${member}: ${colleges.length} colleges in the CSV, assignment file says ${expected}.`);
    }
    const slug = member.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const filename = `${slug}_assigned_colleges.csv`;
    saveFile(filename, new Blob([text], { type: "text/csv;charset=utf-8" }));
    // A viewer whose sandbox lacks allow-downloads drops the file silently, so
    // the single-file build offers the CSV for copying.
    if (isSingleFileBuild()) offerCsvCopy(filename,`${member} — ${colleges.length.toLocaleString()} colleges`, text.replace(/^﻿/, ""));
}

const TEAM_XLSX_NUMERIC_COLUMNS = ["NIRF Rank", "Establishment Year", "Total Intake Capacity"];

async function exportTeamMemberXlsx(btn, member) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing…';
    try {
        const XLSX = await loadSheetJs();
        const colleges = getTeamMemberColleges(member);
        const headers = TEAM_CSV_COLUMNS.map(([header]) => header);
        const rows = [headers];
        colleges.forEach(col => rows.push(TEAM_CSV_COLUMNS.map(([header, get]) => {
            const v = get(col);
            if (v === null || v === undefined || v === "") return "";
            if (TEAM_XLSX_NUMERIC_COLUMNS.includes(header) && !isNaN(Number(v))) return Number(v);
            return String(v);
        })));
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet["!cols"] = headers.map(h => ({ wch: Math.min(40, Math.max(10, h.length + 2)) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, member.slice(0, 31));
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
        const slug = member.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const filename = `${slug}_assigned_colleges.xlsx`;
        await saveFile(filename, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        // A viewer that drops downloads gets the same rows offered to paste into Excel.
        if (isSingleFileBuild()) {
            const { text } = buildTeamMemberCSV(member);
            offerCsvCopy(filename,`${member} — ${colleges.length.toLocaleString()} colleges (paste into Excel)`, text.replace(/^﻿/, ""));
        }
    } catch (error) {
        console.error("Excel download failed:", error);
        alertDownloadProblem(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// A viewer that blocks downloads gives the page no signal, so the copy panel
// is offered, not forced: a small notice the viewer can ignore once the file arrives.
function offerCsvCopy(filename, heading, text) {
    document.querySelector(".download-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "download-toast";
    toast.setAttribute("role", "status");
    toast.innerHTML = `<span>Downloading <code></code>. Didn't get the file?</span><button type="button" class="download-toast-copy">Copy CSV instead</button><button type="button" class="download-toast-close" aria-label="Dismiss">&times;</button>`;
    toast.querySelector("code").textContent = filename;
    const dismiss = () => toast.remove();
    toast.querySelector(".download-toast-copy").addEventListener("click", () => {
        dismiss();
        showCsvCopyPanel(filename, heading, text);
    });
    toast.querySelector(".download-toast-close").addEventListener("click", dismiss);
    document.body.appendChild(toast);
    setTimeout(dismiss, 15000);
}

function showCsvCopyPanel(filename, heading, text) {
    document.querySelector(".csv-copy-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "csv-copy-overlay";
    overlay.innerHTML = `
        <div class="csv-copy-panel" role="dialog" aria-modal="true" aria-label="Copy CSV">
            <div class="csv-copy-head">
                <strong></strong>
                <button type="button" class="csv-copy-close" aria-label="Close">&times;</button>
            </div>
            <p class="csv-copy-help">If <code></code> didn't download, copy the CSV below, paste it into a text editor and save it as a <code>.csv</code> file (or paste straight into Excel / Google Sheets).</p>
            <textarea readonly spellcheck="false"></textarea>
            <div class="csv-copy-actions">
                <span class="csv-copy-status" aria-live="polite"></span>
                <button type="button" class="csv-copy-btn"><i class="fa-solid fa-copy"></i> Copy CSV</button>
            </div>
        </div>`;
    overlay.querySelector("strong").textContent = heading;
    overlay.querySelector(".csv-copy-help code").textContent = filename;
    const area = overlay.querySelector("textarea");
    area.value = text;
    const status = overlay.querySelector(".csv-copy-status");
    const close = () => overlay.remove();
    overlay.querySelector(".csv-copy-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".csv-copy-btn").addEventListener("click", () => {
        const fallback = () => {
            area.focus();
            area.select();
            let ok = false;
            try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
            status.textContent = ok ? "Copied to clipboard." : "Text selected. Press Ctrl+C to copy.";
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => { status.textContent = "Copied to clipboard."; }, fallback);
        } else {
            fallback();
        }
    });
    document.body.appendChild(overlay);
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
    filterPriority.addEventListener("change", filterData);
    filterYear.addEventListener("change", () => {
        saveDirectoryPreferences();
        renderTable();
    });
    filterTeam.addEventListener("change", () => {
        filterData();
        teamSummaryGrid.querySelectorAll(".team-summary-row").forEach(row => {
            row.classList.toggle("active", row.dataset.member === filterTeam.value);
        });
    });
    
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
    setupMasterDownloads();
    setupExternalLinkFallback();
    btnSaveRedditPresence.addEventListener("click", saveRedditPresenceFromModal);

    tableBody.addEventListener("change", (event) => {
        const checkbox = event.target.closest(".visited-checkbox");
        if (!checkbox) return;

        toggleCollegeVisited(checkbox.dataset.collegeId, checkbox.checked);
    });
}
