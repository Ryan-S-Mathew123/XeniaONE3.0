const API = window.location.origin;
let token = sessionStorage.getItem("admin_token") || "";

// ── Toast ──
function toast(msg, isError) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast visible" + (isError ? " error" : "");
    setTimeout(() => t.className = "toast", 3000);
}

// ── Auth ──
async function doLogin() {
    const user = document.getElementById("login-user").value.trim();
    const pass = document.getElementById("login-pass").value;
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    try {
        const res = await fetch(API + "/admin/login", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        if (res.ok && data.token) {
            token = data.token;
            sessionStorage.setItem("admin_token", token);
            document.getElementById("login-overlay").classList.add("hidden");
            document.getElementById("layout").style.display = "flex";
            loadDashboard();
        } else {
            errEl.textContent = data.error || "Invalid credentials";
        }
    } catch (e) { errEl.textContent = "Cannot connect to server"; }
}

function logout() {
    sessionStorage.removeItem("admin_token");
    token = "";
    location.reload();
}

function authHeaders() {
    return { "Content-Type": "application/json", "Authorization": "Bearer " + token };
}

// Enter key on login
document.getElementById("login-pass").addEventListener("keydown", function(e) {
    if (e.key === "Enter") doLogin();
});

// ── Tabs ──
function switchTab(name) {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".nav-item[data-tab]").forEach(n => n.classList.remove("active"));
    document.getElementById("tab-" + name).classList.add("active");
    document.querySelector(`.nav-item[data-tab="${name}"]`).classList.add("active");
    if (name === "dashboard") loadDashboard();
    else if (name === "knowledge") loadKnowledge();
    else if (name === "requests") loadRequests("");
    else if (name === "chats") loadChats();
}

// ── Dashboard ──
async function loadDashboard() {
    try {
        const res = await fetch(API + "/admin/stats", { headers: authHeaders() });
        if (res.status === 401) { logout(); return; }
        const d = await res.json();
        document.getElementById("stat-messages").textContent = d.total_messages || 0;
        document.getElementById("stat-sessions").textContent = d.total_sessions || 0;
        document.getElementById("stat-pending").textContent = d.pending_requests || 0;
        document.getElementById("stat-total-req").textContent = d.total_requests || 0;
        document.getElementById("stat-today-msg").textContent = d.today_messages || 0;
        document.getElementById("stat-today-req").textContent = d.today_requests || 0;
    } catch (e) { console.error(e); }
}

// ── Knowledge ──
async function loadKnowledge() {
    try {
        const res = await fetch(API + "/admin/knowledge", { headers: authHeaders() });
        if (res.status === 401) { logout(); return; }
        const d = await res.json();
        setValue("k-hotel_name", d.hotel_name);
        setValue("k-hotel_tagline", d.hotel_tagline);
        setValue("k-check_in_time", d.check_in_time);
        setValue("k-check_out_time", d.check_out_time);
        const b = d.breakfast || {};
        setValue("k-breakfast_time", b.time);
        setValue("k-breakfast_location", b.location);
        setValue("k-breakfast_type", b.type);
        const w = d.wifi || {};
        setValue("k-wifi_network", w.network);
        setValue("k-wifi_password", w.password);
        const p = d.pool || {};
        setValue("k-pool_hours", p.hours);
        setValue("k-pool_location", p.location);
        const s = d.spa || {};
        setValue("k-spa_hours", s.hours);
        setValue("k-spa_location", s.location);
        setValue("k-spa_services", s.services);
        const g = d.gym || {};
        setValue("k-gym_hours", g.hours);
        setValue("k-gym_location", g.location);
        const pk = d.parking || {};
        setValue("k-parking_type", pk.type);
        setValue("k-parking_rate", pk.rate);
        const fd = d.front_desk || {};
        setValue("k-frontdesk_phone", fd.phone);
        setValue("k-frontdesk_available", fd.available);
        const em = d.emergency || {};
        setValue("k-emergency_assembly", em.fire_assembly);
        setValue("k-emergency_hospital", em.nearest_hospital);
        setValue("k-emergency_number", em.emergency_number);
        const pol = d.policies || {};
        setValue("k-policy_smoking", pol.smoking);
        setValue("k-policy_pets", pol.pets);
        setValue("k-policy_cancellation", pol.cancellation);
    } catch (e) { console.error(e); }
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
}
function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
}

async function saveKnowledge() {
    const data = {
        hotel_name: getVal("k-hotel_name"),
        hotel_tagline: getVal("k-hotel_tagline"),
        check_in_time: getVal("k-check_in_time"),
        check_out_time: getVal("k-check_out_time"),
        breakfast: { time: getVal("k-breakfast_time"), location: getVal("k-breakfast_location"), type: getVal("k-breakfast_type") },
        wifi: { network: getVal("k-wifi_network"), password: getVal("k-wifi_password") },
        pool: { hours: getVal("k-pool_hours"), location: getVal("k-pool_location") },
        spa: { hours: getVal("k-spa_hours"), location: getVal("k-spa_location"), services: getVal("k-spa_services") },
        gym: { hours: getVal("k-gym_hours"), location: getVal("k-gym_location") },
        parking: { type: getVal("k-parking_type"), rate: getVal("k-parking_rate") },
        front_desk: { phone: getVal("k-frontdesk_phone"), available: getVal("k-frontdesk_available") },
        emergency: { fire_assembly: getVal("k-emergency_assembly"), nearest_hospital: getVal("k-emergency_hospital"), emergency_number: getVal("k-emergency_number") },
        policies: { smoking: getVal("k-policy_smoking"), pets: getVal("k-policy_pets"), cancellation: getVal("k-policy_cancellation") },
        restaurants: [], services: [], nearby_attractions: []
    };
    try {
        const res = await fetch(API + "/admin/knowledge", {
            method: "POST", headers: authHeaders(), body: JSON.stringify(data)
        });
        if (res.ok) toast("Knowledge base saved successfully");
        else toast("Failed to save", true);
    } catch (e) { toast("Connection error", true); }
}

// ── Requests ──
async function loadRequests(status) {
    try {
        const url = status ? API + "/admin/requests?status=" + status : API + "/admin/requests";
        const res = await fetch(url, { headers: authHeaders() });
        const d = await res.json();
        const tbody = document.getElementById("requests-body");
        tbody.innerHTML = "";
        if (!d.requests || d.requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#8a8e99;">No service requests found</td></tr>';
            return;
        }
        d.requests.forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>#${r.id}</td>
                <td>${r.room_number || "—"}</td>
                <td>${r.category}</td>
                <td style="max-width:200px;">${r.description}</td>
                <td><span class="badge ${r.status}">${r.status.replace("_", " ")}</span></td>
                <td>${r.assigned_to || "—"}</td>
                <td style="font-size:12px;color:#8a8e99;">${r.created_at || ""}</td>
                <td>
                    <select class="action-select" onchange="updateRequest(${r.id}, this.value)">
                        <option value="">Change...</option>
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                    </select>
                </td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function updateRequest(id, status) {
    if (!status) return;
    try {
        const res = await fetch(API + "/admin/requests/" + id, {
            method: "PUT", headers: authHeaders(),
            body: JSON.stringify({ status: status, assigned_to: "" })
        });
        if (res.ok) { toast("Request #" + id + " updated"); loadRequests(""); }
        else toast("Update failed", true);
    } catch (e) { toast("Connection error", true); }
}

function setActiveFilter(btn) {
    btn.parentElement.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
}

// ── Chats ──
async function loadChats() {
    try {
        const room = document.getElementById("chat-room-filter").value.trim();
        const url = room ? API + "/admin/chats?room=" + room : API + "/admin/chats";
        const res = await fetch(url, { headers: authHeaders() });
        const d = await res.json();
        const tbody = document.getElementById("chats-body");
        tbody.innerHTML = "";
        if (!d.logs || d.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:#8a8e99;">No chat logs found</td></tr>';
            return;
        }
        d.logs.forEach(l => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-size:12px;color:#8a8e99;white-space:nowrap;">${l.created_at || ""}</td>
                <td>${l.room_number || "—"}</td>
                <td><span class="badge ${l.role}">${l.role}</span></td>
                <td style="max-width:400px;word-break:break-word;">${l.message}</td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// ── Init ──
window.onload = async function() {
    if (token) {
        try {
            const res = await fetch(API + "/admin/verify", { headers: authHeaders() });
            if (res.ok) {
                document.getElementById("login-overlay").classList.add("hidden");
                document.getElementById("layout").style.display = "flex";
                loadDashboard();
                return;
            }
        } catch (e) {}
    }
    // Show login
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("login-user").focus();
};
