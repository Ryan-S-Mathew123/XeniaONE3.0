const API = window.location.origin;
let token = sessionStorage.getItem("admin_token") || "";
let currentRestaurants = [];

// Toast
function toast(msg, isError) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast visible" + (isError ? " error" : "");
    setTimeout(() => t.className = "toast", 3000);
}

// Auth
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

document.getElementById("login-pass").addEventListener("keydown", function(e) {
    if (e.key === "Enter") doLogin();
});

// Tabs
function switchTab(name) {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".nav-item[data-tab]").forEach(n => n.classList.remove("active"));
    document.getElementById("tab-" + name).classList.add("active");
    document.querySelector(`.nav-item[data-tab="${name}"]`).classList.add("active");
    if (name === "dashboard") loadDashboard();
    else if (name === "knowledge") loadKnowledge();
    else if (name === "gallery") loadGallery();
    else if (name === "requests") loadRequests("");
    else if (name === "chats") loadChats();
}

// Dashboard
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

// Knowledge
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
        setValue("k-breakfast_photo", b.photo);
        const w = d.wifi || {};
        setValue("k-wifi_network", w.network);
        setValue("k-wifi_password", w.password);
        setValue("k-wifi_photo", w.photo);
        const p = d.pool || {};
        setValue("k-pool_hours", p.hours);
        setValue("k-pool_location", p.location);
        setValue("k-pool_photo", p.photo);
        const s = d.spa || {};
        setValue("k-spa_hours", s.hours);
        setValue("k-spa_location", s.location);
        setValue("k-spa_services", s.services);
        setValue("k-spa_description", s.description);
        setValue("k-spa_photo", s.photo);
        const g = d.gym || {};
        setValue("k-gym_hours", g.hours);
        setValue("k-gym_location", g.location);
        setValue("k-gym_photo", g.photo);
        const pk = d.parking || {};
        setValue("k-parking_type", pk.type);
        setValue("k-parking_rate", pk.rate);
        setValue("k-parking_photo", pk.photo);
        const fd = d.front_desk || {};
        setValue("k-frontdesk_phone", fd.phone);
        setValue("k-frontdesk_available", fd.available);
        setValue("k-frontdesk_photo", fd.photo);
        const em = d.emergency || {};
        setValue("k-emergency_assembly", em.fire_assembly);
        setValue("k-emergency_hospital", em.nearest_hospital);
        setValue("k-emergency_number", em.emergency_number);
        setValue("k-emergency_photo", em.photo);
        const pol = d.policies || {};
        setValue("k-policy_smoking", pol.smoking);
        setValue("k-policy_pets", pol.pets);
        setValue("k-policy_cancellation", pol.cancellation);
        const sl = d.social_links || {};
        setValue("k-social_website", sl.website);
        setValue("k-social_instagram", sl.instagram);
        setValue("k-social_facebook", sl.facebook);
        setValue("k-social_twitter", sl.twitter);
        
        currentRestaurants = d.restaurants || [];
        renderRestaurants();
    } catch (e) { console.error(e); }
}

function renderRestaurants() {
    const container = document.getElementById("restaurants-container");
    if(currentRestaurants.length === 0) {
        container.innerHTML = "<p style='color:var(--text-muted); font-size:13px;'>No restaurants added yet.</p>";
        return;
    }
    
    container.innerHTML = currentRestaurants.map((r, index) => `
        <div class="restaurant-block" style="background:var(--bg); border:1px solid var(--border); padding:20px; border-radius:8px; display:grid; grid-template-columns: 1fr 1fr; gap:16px; position:relative;">
            <button type="button" onclick="removeRestaurant(${index})" style="position:absolute; top:12px; right:12px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:20px; line-height:1;">&times;</button>
            <div style="grid-column: 1 / -1; font-weight: 600; font-size: 14px; color:var(--gold); border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:4px;">Restaurant ${index + 1}</div>
            
            <div><label style="display:block; margin-bottom:6px; font-size:12px; color:var(--text-muted);">Name</label><input type="text" id="r-name-${index}" value="${r.name || ''}" placeholder="e.g. The Grand Pavilion" style="width:100%; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text); font-family:inherit;"></div>
            <div><label style="display:block; margin-bottom:6px; font-size:12px; color:var(--text-muted);">Cuisine</label><input type="text" id="r-cuisine-${index}" value="${r.cuisine || ''}" placeholder="e.g. Italian" style="width:100%; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text); font-family:inherit;"></div>
            <div><label style="display:block; margin-bottom:6px; font-size:12px; color:var(--text-muted);">Hours</label><input type="text" id="r-hours-${index}" value="${r.hours || ''}" placeholder="e.g. 6:00 PM - 11:00 PM" style="width:100%; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text); font-family:inherit;"></div>
            <div><label style="display:block; margin-bottom:6px; font-size:12px; color:var(--text-muted);">Location</label><input type="text" id="r-location-${index}" value="${r.location || ''}" placeholder="e.g. Ground Floor" style="width:100%; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text); font-family:inherit;"></div>
            
            <div style="grid-column: 1 / -1;">
                <label style="display:block; margin-bottom:6px; font-size:12px; color:var(--text-muted);">Photo Link</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    <input type="text" id="r-photo-${index}" value="${r.photo || ''}" placeholder="URL will appear here after upload" readonly style="flex:1; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text-muted); font-family:inherit;">
                    <input type="file" id="r-img-${index}" accept="image/*" style="display:none;" onchange="uploadFeaturePhoto(this, 'r-photo-${index}')">
                    <button type="button" class="save-btn" style="width:auto; padding:10px 16px; margin:0;" onclick="document.getElementById('r-img-${index}').click()">Upload Photo</button>
                </div>
            </div>
            
            <div style="grid-column: 1 / -1;">
                <label style="display:block; margin-bottom:6px; font-size:12px; color:var(--text-muted);">Menu PDF Link</label>
                <div style="display:flex; gap:10px; align-items:center;">
                    <input type="text" id="r-menu-${index}" value="${r.menu_url || ''}" placeholder="URL will appear here after upload" readonly style="flex:1; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:4px; color:var(--text-muted); font-family:inherit;">
                    <input type="file" id="r-file-${index}" accept=".pdf" style="display:none;" onchange="uploadMenu(this, ${index})">
                    <button type="button" class="save-btn" style="width:auto; padding:10px 16px; margin:0;" onclick="document.getElementById('r-file-${index}').click()">Upload PDF</button>
                </div>
            </div>
        </div>
    `).join("");
}

function addRestaurant() {
    saveCurrentRestaurantsState();
    currentRestaurants.push({ name: "", cuisine: "", hours: "", location: "", menu_url: "" });
    renderRestaurants();
}

function removeRestaurant(index) {
    if(!confirm("Remove this restaurant?")) return;
    saveCurrentRestaurantsState();
    currentRestaurants.splice(index, 1);
    renderRestaurants();
}

function saveCurrentRestaurantsState() {
    currentRestaurants = currentRestaurants.map((r, index) => {
        const nameEl = document.getElementById(`r-name-${index}`);
        if (!nameEl) return r;
        return {
            name: document.getElementById(`r-name-${index}`).value.trim(),
            cuisine: document.getElementById(`r-cuisine-${index}`).value.trim(),
            hours: document.getElementById(`r-hours-${index}`).value.trim(),
            location: document.getElementById(`r-location-${index}`).value.trim(),
            photo: document.getElementById(`r-photo-${index}`).value.trim(),
            menu_url: document.getElementById(`r-menu-${index}`).value.trim()
        };
    });
}

async function uploadMenu(input, index) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append("photo", file);
    try {
        const res = await fetch(API + "/admin/gallery", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById(`r-menu-${index}`).value = data.url;
            toast("Menu uploaded successfully");
            saveCurrentRestaurantsState();
        } else {
            toast("Upload failed", true);
        }
    } catch (e) { toast("Upload error", true); }
}

async function uploadFeaturePhoto(input, targetId) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append("photo", file);
    try {
        const res = await fetch(API + "/admin/gallery", {
            method: "POST",
            headers: { "Authorization": "Bearer " + token },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById(targetId).value = data.url;
            toast("Photo uploaded successfully");
            if (targetId.startsWith("r-photo-")) {
                saveCurrentRestaurantsState();
            }
        } else {
            toast("Upload failed", true);
        }
    } catch (e) { toast("Upload error", true); }
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
    saveCurrentRestaurantsState();
    const data = {
        hotel_name: getVal("k-hotel_name"),
        hotel_tagline: getVal("k-hotel_tagline"),
        check_in_time: getVal("k-check_in_time"),
        check_out_time: getVal("k-check_out_time"),
        breakfast: { time: getVal("k-breakfast_time"), location: getVal("k-breakfast_location"), type: getVal("k-breakfast_type"), photo: getVal("k-breakfast_photo") },
        wifi: { network: getVal("k-wifi_network"), password: getVal("k-wifi_password"), photo: getVal("k-wifi_photo") },
        pool: { hours: getVal("k-pool_hours"), location: getVal("k-pool_location"), photo: getVal("k-pool_photo") },
        spa: { hours: getVal("k-spa_hours"), location: getVal("k-spa_location"), services: getVal("k-spa_services"), description: getVal("k-spa_description"), photo: getVal("k-spa_photo") },
        gym: { hours: getVal("k-gym_hours"), location: getVal("k-gym_location"), photo: getVal("k-gym_photo") },
        parking: { type: getVal("k-parking_type"), rate: getVal("k-parking_rate"), photo: getVal("k-parking_photo") },
        front_desk: { phone: getVal("k-frontdesk_phone"), available: getVal("k-frontdesk_available"), photo: getVal("k-frontdesk_photo") },
        emergency: { fire_assembly: getVal("k-emergency_assembly"), nearest_hospital: getVal("k-emergency_hospital"), emergency_number: getVal("k-emergency_number"), photo: getVal("k-emergency_photo") },
        policies: { smoking: getVal("k-policy_smoking"), pets: getVal("k-policy_pets"), cancellation: getVal("k-policy_cancellation") },
        social_links: { website: getVal("k-social_website"), instagram: getVal("k-social_instagram"), facebook: getVal("k-social_facebook"), twitter: getVal("k-social_twitter") },
        restaurants: currentRestaurants, services: [], nearby_attractions: []
    };
    try {
        const res = await fetch(API + "/admin/knowledge", {
            method: "POST", headers: authHeaders(), body: JSON.stringify(data)
        });
        if (res.ok) toast("Knowledge base saved successfully");
        else toast("Failed to save", true);
    } catch (e) { toast("Connection error", true); }
}

// Gallery
async function loadGallery() {
    try {
        const res = await fetch(API + "/admin/gallery", { headers: authHeaders() });
        const d = await res.json();
        const grid = document.getElementById("photo-grid");

        if (!d.photos || d.photos.length === 0) {
            grid.innerHTML = '<div class="photo-empty">No photos uploaded yet. Click "Upload Photos" to get started.</div>';
            return;
        }

        grid.innerHTML = d.photos.map(p => `
            <div class="photo-card">
                <img src="${p.url}" alt="Hotel photo">
                <button class="photo-delete" onclick="deletePhoto('${p.filename}')" title="Delete photo">&times;</button>
            </div>
        `).join("");
    } catch (e) { console.error(e); }
}

async function uploadPhotos(files) {
    for (const file of files) {
        const formData = new FormData();
        formData.append("photo", file);
        try {
            const res = await fetch(API + "/admin/gallery", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token },
                body: formData
            });
            if (!res.ok) toast("Failed to upload " + file.name, true);
        } catch (e) { toast("Upload error", true); }
    }
    toast("Photos uploaded successfully");
    loadGallery();
    document.getElementById("photo-upload").value = "";
}

async function deletePhoto(filename) {
    if (!confirm("Delete this photo?")) return;
    try {
        const res = await fetch(API + "/admin/gallery/" + filename, {
            method: "DELETE", headers: authHeaders()
        });
        if (res.ok) { toast("Photo deleted"); loadGallery(); }
        else toast("Delete failed", true);
    } catch (e) { toast("Connection error", true); }
}

async function clearAllPhotos() {
    if (!confirm("Are you sure you want to delete ALL photos? This cannot be undone.")) return;
    try {
        const res = await fetch(API + "/admin/gallery/clear", {
            method: "DELETE", headers: authHeaders()
        });
        if (res.ok) {
            toast("All photos cleared");
            loadGallery();
        } else {
            toast("Failed to clear photos", true);
        }
    } catch (e) { toast("Connection error", true); }
}

// Requests
async function loadRequests(status) {
    try {
        const url = status ? API + "/admin/requests?status=" + status : API + "/admin/requests";
        const res = await fetch(url, { headers: authHeaders() });
        const d = await res.json();
        const tbody = document.getElementById("requests-body");
        tbody.innerHTML = "";
        if (!d.requests || d.requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#8a8e99;">No service requests found</td></tr>';
            return;
        }
        d.requests.forEach(r => {
            const tr = document.createElement("tr");
            const statusClass = r.status || "pending";
            tr.innerHTML = `
                <td>#${r.id}</td>
                <td>${r.room_number || "\u2014"}</td>
                <td>${r.category}</td>
                <td style="max-width:200px;">${r.description}</td>
                <td><span class="badge ${statusClass}">${(r.status || "pending").replace("_", " ")}</span></td>
                <td style="font-size:12px;color:#8a8e99;">${r.created_at || ""}</td>
                <td class="action-cell">
                    ${r.status === 'pending' ? `<button class="action-btn confirm-btn" onclick="updateRequest(${r.id}, 'in_progress')">Confirm</button>` : ''}
                    ${r.status === 'in_progress' ? `<button class="action-btn complete-btn" onclick="updateRequest(${r.id}, 'completed')">Complete</button>` : ''}
                    ${r.status === 'completed' ? `<span class="done-label">Done</span>` : ''}
                    <button class="action-btn delete-btn" onclick="deleteRequest(${r.id})">Delete</button>
                </td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

async function updateRequest(id, status) {
    try {
        const res = await fetch(API + "/admin/requests/" + id, {
            method: "PUT", headers: authHeaders(),
            body: JSON.stringify({ status: status, assigned_to: "" })
        });
        if (res.ok) { toast("Request #" + id + " updated"); loadRequests(""); }
        else toast("Update failed", true);
    } catch (e) { toast("Connection error", true); }
}

async function deleteRequest(id) {
    if (!confirm("Delete request #" + id + "?")) return;
    try {
        const res = await fetch(API + "/admin/requests/" + id, {
            method: "DELETE", headers: authHeaders()
        });
        if (res.ok) { toast("Request #" + id + " deleted"); loadRequests(""); }
        else toast("Delete failed", true);
    } catch (e) { toast("Connection error", true); }
}

async function clearAllRequests() {
    if (!confirm("Clear ALL service requests? This cannot be undone.")) return;
    try {
        const res = await fetch(API + "/admin/requests/clear", {
            method: "DELETE", headers: authHeaders()
        });
        if (res.ok) { toast("All requests cleared"); loadRequests(""); }
        else toast("Clear failed", true);
    } catch (e) { toast("Connection error", true); }
}

function setActiveFilter(btn) {
    btn.parentElement.querySelectorAll(".filter-btn:not(.danger-btn)").forEach(b => b.classList.remove("active"));
    if (!btn.classList.contains("danger-btn")) btn.classList.add("active");
}

// Chats
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
                <td>${l.room_number || "\u2014"}</td>
                <td><span class="badge ${l.role}">${l.role}</span></td>
                <td style="max-width:400px;word-break:break-word;">${l.message}</td>`;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

// Init
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
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("login-user").focus();
};
