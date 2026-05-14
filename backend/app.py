from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
from groq import Groq
from functools import wraps
from werkzeug.utils import secure_filename
import json, os, jwt, sqlite3, uuid, html
from datetime import datetime, timedelta

# ── Load Environment ──
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = Flask(__name__)
CORS(app, origins=os.getenv("ALLOWED_ORIGINS", "*").split(","))

limiter = Limiter(get_remote_address, app=app, default_limits=["2000 per day", "600 per hour"], storage_uri="memory://")

SECRET_KEY = os.getenv("JWT_SECRET", "change-this-secret-key")
ADMIN_USER = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASSWORD", "admin123")
GROQ_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_KEY) if GROQ_KEY else None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KNOWLEDGE_FILE = os.path.join(BASE_DIR, "knowledge.json")
DB_FILE = os.path.join(BASE_DIR, "hotel.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "pdf"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# ══════════════════════════════════════
#  DATABASE
# ══════════════════════════════════════
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_FILE)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db:
        db.close()

def init_db():
    db = sqlite3.connect(DB_FILE)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            room_number TEXT,
            guest_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS chat_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            room_number TEXT,
            role TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS service_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            room_number TEXT,
            category TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending',
            assigned_to TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS admin_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    db.close()

init_db()

# ══════════════════════════════════════
#  KNOWLEDGE CACHE
# ══════════════════════════════════════
_knowledge_cache = None
_knowledge_mtime = 0

def load_knowledge():
    global _knowledge_cache, _knowledge_mtime
    try:
        mtime = os.path.getmtime(KNOWLEDGE_FILE)
        if _knowledge_cache is None or mtime > _knowledge_mtime:
            with open(KNOWLEDGE_FILE, encoding="utf-8") as f:
                _knowledge_cache = json.load(f)
            _knowledge_mtime = mtime
    except Exception:
        _knowledge_cache = {}
    return _knowledge_cache

# ══════════════════════════════════════
#  AUTH HELPERS
# ══════════════════════════════════════
def create_token(username):
    return jwt.encode(
        {"sub": username, "iat": datetime.utcnow(), "exp": datetime.utcnow() + timedelta(hours=8)},
        SECRET_KEY, algorithm="HS256"
    )

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            return jsonify({"error": "Token required"}), 401
        try:
            jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated

def sanitize(text, max_length=500):
    if not isinstance(text, str):
        return ""
    return html.escape(text.strip())[:max_length]

# ══════════════════════════════════════
#  INTENT DETECTION
# ══════════════════════════════════════
INTENT_PATTERNS = {
    "Housekeeping": ["towel", "linen", "bedsheet", "pillow", "blanket", "clean room", "housekeeping", "toiletries", "soap", "shampoo", "water bottle"],
    "Room Service": ["room service", "order food", "in-room dining", "hungry", "send food", "meal to room", "order a", "order some", "i want to order", "bring me", "burger", "pasta", "steak", "pizza", "coffee", "tea"],
    "Transport": ["taxi", "cab", "uber", "shuttle", "airport transfer", "pick up", "pickup", "drop off", "transport", "car hire"],
    "Maintenance": ["repair", "broken", "not working", "fix", "leak", "leaking", "bulb", "ac not", "air conditioning", "heater", "plumbing", "tv not working", "wifi not working"],
    "Spa": ["book spa", "spa appointment", "massage booking", "facial booking"],
    "Laundry": ["laundry", "iron", "dry clean", "wash clothes", "pressing"],
    "Wake-up Call": ["wake up call", "wake-up call", "morning call", "alarm call", "wake me up"],
}

def detect_request(msg):
    msg_lower = msg.lower()
    for category, keywords in INTENT_PATTERNS.items():
        for kw in keywords:
            if kw in msg_lower:
                return category
    return None

def service_response(category, room):
    r = f" to Room {room}" if room else ""
    responses = {
        "Housekeeping": f"I've notified housekeeping. They will attend to your request{r} shortly.",
        "Room Service": f"I've sent your request to room service{r}. They will process your order and contact you if they need clarification.",
        "Transport": f"I've logged your transport request{r}. Our front desk team will arrange this and confirm the details with you shortly.",
        "Maintenance": f"I've raised a maintenance ticket{r}. Our engineering team will be there as soon as possible.",
        "Spa": f"I've forwarded your spa inquiry. Our wellness team will reach out{r} to confirm availability and timing.",
        "Laundry": f"I've notified our laundry service. They will collect your items{r} shortly.",
        "Wake-up Call": f"I've recorded your wake-up call request{r}. Our team will ensure everything is set.",
    }
    return responses.get(category, f"I've logged your request{r}. Our team will assist you shortly.")

# ══════════════════════════════════════
#  LOCAL RAG FALLBACK
# ══════════════════════════════════════
def rag_answer(hotel, user_msg):
    """Keyword-based retrieval from knowledge base — works without any AI API."""
    msg = user_msg.lower()
    
    # WiFi
    if any(w in msg for w in ["wifi", "wi-fi", "internet", "network", "password", "connect"]):
        w = hotel.get("wifi", {})
        if isinstance(w, dict) and w.get("network"):
            return f"Our WiFi network is '{w['network']}' and the password is '{w.get('password', 'available at the front desk')}'."
    
    # Breakfast
    if any(w in msg for w in ["breakfast", "morning meal", "buffet"]):
        b = hotel.get("breakfast", {})
        if isinstance(b, dict) and b.get("time"):
            parts = [f"Breakfast is served {b['time']}"]
            if b.get("location"): parts.append(f"at {b['location']}")
            if b.get("type"): parts.append(f"({b['type']})")
            return " ".join(parts) + "."
    
    # Pool
    if any(w in msg for w in ["pool", "swim", "swimming"]):
        p = hotel.get("pool", {})
        if isinstance(p, dict) and p.get("hours"):
            loc = f" at {p['location']}" if p.get("location") else ""
            return f"The pool is open {p['hours']}{loc}."
    
    # Spa
    if any(w in msg for w in ["spa", "massage", "facial", "sauna", "wellness", "steam", "treatment"]):
        s = hotel.get("spa", {})
        if isinstance(s, dict) and s.get("hours"):
            parts = [f"Our spa is open {s['hours']}"]
            if s.get("location"): parts.append(f"on the {s['location']}")
            if s.get("services"): parts.append(f". Available services include: {s['services']}")
            if s.get("description"): parts.append(f". {s['description']}")
            return " ".join(parts) + " Please contact the front desk for reservations."
    
    # Gym / Fitness
    if any(w in msg for w in ["gym", "fitness", "workout", "exercise", "weight"]):
        g = hotel.get("gym", {})
        if isinstance(g, dict) and g.get("hours"):
            loc = f" on the {g['location']}" if g.get("location") else ""
            return f"Our fitness center is {g['hours']}{loc}."
    
    # Check-in / Check-out
    if any(w in msg for w in ["check-in", "checkin", "check in"]):
        t = hotel.get("check_in_time", "")
        if t: return f"Check-in time is {t}. Please approach the front desk upon arrival."
    if any(w in msg for w in ["check-out", "checkout", "check out"]):
        t = hotel.get("check_out_time", "")
        if t: return f"Check-out time is {t}. Late check-out may be available upon request."
    
    # Parking
    if any(w in msg for w in ["parking", "park", "valet", "car"]):
        p = hotel.get("parking", {})
        if isinstance(p, dict) and p.get("type"):
            rate = f" {p['rate']}." if p.get("rate") else "."
            return f"Parking: {p['type']}.{rate}"
    
    # Front desk
    if any(w in msg for w in ["front desk", "reception", "phone", "call", "contact"]):
        fd = hotel.get("front_desk", {})
        if isinstance(fd, dict) and fd.get("phone"):
            avail = f" ({fd['available']})" if fd.get("available") else ""
            return f"You can reach our front desk at {fd['phone']}{avail}."
    
    # Emergency
    if any(w in msg for w in ["emergency", "hospital", "fire", "ambulance", "help urgent"]):
        em = hotel.get("emergency", {})
        if isinstance(em, dict) and em.get("emergency_number"):
            parts = [f"Emergency number: {em['emergency_number']}"]
            if em.get("nearest_hospital"): parts.append(f"Nearest hospital: {em['nearest_hospital']}")
            if em.get("fire_assembly"): parts.append(f"Fire assembly point: {em['fire_assembly']}")
            return ". ".join(parts) + "."
    
    # Policies
    if any(w in msg for w in ["smoking", "smoke"]):
        pol = hotel.get("policies", {})
        if isinstance(pol, dict) and pol.get("smoking"): return pol["smoking"]
    if any(w in msg for w in ["pet", "dog", "cat", "animal"]):
        pol = hotel.get("policies", {})
        if isinstance(pol, dict) and pol.get("pets"): return pol["pets"]
    if any(w in msg for w in ["cancel", "cancellation", "refund"]):
        pol = hotel.get("policies", {})
        if isinstance(pol, dict) and pol.get("cancellation"): return pol["cancellation"]
    
    # Restaurant
    restaurants = hotel.get("restaurants", [])
    if any(w in msg for w in ["restaurant", "dining", "eat", "food", "menu", "lunch", "dinner"]) and restaurants:
        lines = []
        for r in restaurants:
            lines.append(f"{r.get('name','')}: {r.get('cuisine','')} — {r.get('hours','')}, {r.get('location','')}")
        return "Our restaurants:\n" + "\n".join(lines)
    
    return None

# ══════════════════════════════════════
#  AI PROMPT BUILDER
# ══════════════════════════════════════
def build_prompt(hotel, user_msg):
    parts = []
    parts.append(f"Hotel: {hotel.get('hotel_name', 'Our Hotel')}")
    parts.append(f"Check-in: {hotel.get('check_in_time', 'N/A')} | Check-out: {hotel.get('check_out_time', 'N/A')}")

    b = hotel.get("breakfast", {})
    if isinstance(b, dict) and b.get("time"):
        parts.append(f"Breakfast: {b['time']} at {b.get('location', 'N/A')} ({b.get('type', '')})")

    for r in hotel.get("restaurants", []):
        parts.append(f"Restaurant: {r['name']} — {r['cuisine']}, {r['hours']}, {r['location']}")

    w = hotel.get("wifi", {})
    if isinstance(w, dict) and w.get("network"):
        parts.append(f"WiFi: Network '{w['network']}', Password '{w['password']}'")

    for key in ["pool", "spa", "gym"]:
        obj = hotel.get(key, {})
        if isinstance(obj, dict) and obj.get("hours"):
            extra = f" — Services: {obj['services']}" if obj.get("services") else ""
            parts.append(f"{key.title()}: {obj['hours']} at {obj.get('location', '')}{extra}")

    p = hotel.get("parking", {})
    if isinstance(p, dict) and p.get("type"):
        parts.append(f"Parking: {p['type']} — {p.get('rate', '')}")

    fd = hotel.get("front_desk", {})
    if isinstance(fd, dict):
        parts.append(f"Front Desk: {fd.get('phone', '')} ({fd.get('available', '')})")

    em = hotel.get("emergency", {})
    if isinstance(em, dict) and em.get("emergency_number"):
        parts.append(f"Emergency: {em['emergency_number']} | Hospital: {em.get('nearest_hospital', '')} | Assembly: {em.get('fire_assembly', '')}")

    pol = hotel.get("policies", {})
    if isinstance(pol, dict):
        for k, v in pol.items():
            parts.append(f"Policy ({k}): {v}")

    svcs = hotel.get("services", [])
    if svcs:
        parts.append(f"Services: {', '.join(svcs)}")

    for a in hotel.get("nearby_attractions", []):
        parts.append(f"Nearby: {a['name']} ({a['distance']})")

    return f"Hotel Information:\n" + "\n".join(parts) + f"\n\nGuest Question: {user_msg}"

# ══════════════════════════════════════
#  CONVERSATION HISTORY
# ══════════════════════════════════════
def get_history(session_id, limit=8):
    db = get_db()
    rows = db.execute(
        "SELECT role, message FROM chat_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
        (session_id, limit)
    ).fetchall()
    return [{"role": r["role"], "content": r["message"]} for r in reversed(rows)]

# ══════════════════════════════════════
#  PUBLIC ROUTES
# ══════════════════════════════════════
@app.route("/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})

@app.route("/session", methods=["POST"])
@limiter.limit("20 per minute")
def create_session():
    data = request.json or {}
    sid = str(uuid.uuid4())
    room = sanitize(data.get("room_number", ""), 10)
    name = sanitize(data.get("guest_name", ""), 100)
    db = get_db()
    db.execute("INSERT INTO sessions (id, room_number, guest_name) VALUES (?, ?, ?)", (sid, room, name))
    db.commit()
    return jsonify({"session_id": sid})

@app.route("/chat", methods=["POST"])
@limiter.limit("30 per minute")
def chat():
    data = request.json or {}
    user_msg = sanitize(data.get("message", ""), 500)
    session_id = data.get("session_id", "")
    room = sanitize(data.get("room_number", ""), 10)

    if not user_msg:
        return jsonify({"reply": "Please enter a message."})

    hotel = load_knowledge()
    db = get_db()

    # Log user message
    db.execute("INSERT INTO chat_logs (session_id, room_number, role, message) VALUES (?, ?, 'user', ?)",
               (session_id, room, user_msg))
    if session_id:
        db.execute("UPDATE sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?", (session_id,))

    # Detect service request
    category = detect_request(user_msg)
    ask_room = False
    if category and not room:
        reply = f"I'd be happy to help with your {category.lower()} request. Could you please share your room number so we can assist you right away?"
        ask_room = True
    elif category:
        reply = service_response(category, room)
        db.execute("INSERT INTO service_requests (session_id, room_number, category, description) VALUES (?, ?, ?, ?)",
                   (session_id, room, category, user_msg))
    else:
        # Try local RAG first
        rag_reply = rag_answer(hotel, user_msg)
        print(f"[DEBUG] user_msg={repr(user_msg)}, category={category}, rag_reply={repr(rag_reply)}")
        if rag_reply:
            reply = rag_reply
        else:
            # AI with conversation memory
            prompt = build_prompt(hotel, user_msg)
            history = get_history(session_id) if session_id else []
            hotel_name = hotel.get("hotel_name", "our hotel")

            messages = [{
                "role": "system",
                "content": (
                    f"You are a professional digital concierge for {hotel_name}. "
                    "RULES: Answer ONLY the guest's question using the hotel information provided. "
                    "Keep responses concise, warm, and professional. Do NOT introduce yourself repeatedly. "
                    "If you don't have the information, politely suggest contacting the front desk. "
                    "Never fabricate information not in the hotel data. Do NOT use emojis."
                )
            }]
            messages.extend(history[-6:])
            messages.append({"role": "user", "content": prompt})

            try:
                if not client:
                    reply = "I don't have specific information about that. Please contact our front desk for assistance."
                else:
                    resp = client.chat.completions.create(
                        model="llama-3.1-8b-instant", messages=messages, max_tokens=300, temperature=0.7
                    )
                    reply = resp.choices[0].message.content
            except Exception as e:
                print("AI Error:", e)
                reply = "I apologize for the inconvenience. Please contact our front desk for immediate assistance."

    # Log bot reply
    db.execute("INSERT INTO chat_logs (session_id, room_number, role, message) VALUES (?, ?, 'assistant', ?)",
               (session_id, room, reply))
    db.commit()
    return jsonify({"reply": reply, "service_request": category, "ask_room": ask_room})

@app.route("/knowledge/public")
def public_knowledge():
    h = load_knowledge()
    return jsonify({
        "hotel_name": h.get("hotel_name", ""), "hotel_tagline": h.get("hotel_tagline", ""),
        "check_in_time": h.get("check_in_time", ""), "check_out_time": h.get("check_out_time", ""),
        "breakfast": h.get("breakfast", {}), "restaurants": h.get("restaurants", []),
        "pool": h.get("pool", {}), "spa": h.get("spa", {}), "gym": h.get("gym", {}),
        "wifi": h.get("wifi", {}), "parking": h.get("parking", {}),
        "front_desk": h.get("front_desk", {}), "emergency": h.get("emergency", {}),
        "policies": h.get("policies", {}),
        "services": h.get("services", []),
        "social_links": h.get("social_links", {}),
    })

@app.route("/gallery/public")
@limiter.exempt
def public_gallery():
    photos = []
    if os.path.exists(UPLOAD_DIR):
        for f in sorted(os.listdir(UPLOAD_DIR)):
            if allowed_file(f) and not f.lower().endswith(".pdf"):
                photos.append({"filename": f, "url": f"/uploads/{f}"})
    return jsonify({"photos": photos})

# ══════════════════════════════════════
#  ADMIN ROUTES
# ══════════════════════════════════════
@app.route("/admin/login", methods=["POST"])
@limiter.limit("5 per minute")
def admin_login():
    data = request.json or {}
    if data.get("username") == ADMIN_USER and data.get("password") == ADMIN_PASS:
        return jsonify({"token": create_token(data["username"])})
    return jsonify({"error": "Invalid credentials"}), 401

@app.route("/admin/verify")
@require_admin
def verify_token():
    return jsonify({"valid": True})

@app.route("/admin/knowledge", methods=["GET"])
@require_admin
def get_knowledge():
    return jsonify(load_knowledge())

@app.route("/admin/knowledge", methods=["POST"])
@require_admin
def update_knowledge():
    global _knowledge_cache, _knowledge_mtime
    new_data = request.json
    with open(KNOWLEDGE_FILE, "w", encoding="utf-8") as f:
        json.dump(new_data, f, indent=2)
    _knowledge_cache = None
    db = get_db()
    db.execute("INSERT INTO admin_logs (action, details) VALUES ('knowledge_update', ?)",
               (json.dumps({"keys": list(new_data.keys())}),))
    db.commit()
    return jsonify({"status": "saved"})

@app.route("/admin/chats")
@require_admin
def get_chats():
    db = get_db()
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 50))
    room = request.args.get("room", "")
    offset = (page - 1) * per_page

    if room:
        rows = db.execute("SELECT * FROM chat_logs WHERE room_number = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                          (room, per_page, offset)).fetchall()
        total = db.execute("SELECT COUNT(*) as c FROM chat_logs WHERE room_number = ?", (room,)).fetchone()["c"]
    else:
        rows = db.execute("SELECT * FROM chat_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
                          (per_page, offset)).fetchall()
        total = db.execute("SELECT COUNT(*) as c FROM chat_logs").fetchone()["c"]

    return jsonify({"logs": [dict(r) for r in rows], "total": total, "page": page, "per_page": per_page})

@app.route("/admin/requests")
@require_admin
def get_requests():
    db = get_db()
    status_filter = request.args.get("status", "")
    if status_filter:
        rows = db.execute("SELECT * FROM service_requests WHERE status = ? ORDER BY created_at DESC",
                          (status_filter,)).fetchall()
    else:
        rows = db.execute("SELECT * FROM service_requests ORDER BY created_at DESC").fetchall()
    return jsonify({"requests": [dict(r) for r in rows]})

@app.route("/admin/requests/<int:req_id>", methods=["PUT"])
@require_admin
def update_request(req_id):
    data = request.json or {}
    status = data.get("status", "")
    assigned = sanitize(data.get("assigned_to", ""), 100)
    if status not in ["pending", "in_progress", "completed"]:
        return jsonify({"error": "Invalid status"}), 400
    db = get_db()
    db.execute("UPDATE service_requests SET status=?, assigned_to=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
               (status, assigned, req_id))
    db.execute("INSERT INTO admin_logs (action, details) VALUES ('request_update', ?)",
               (json.dumps({"id": req_id, "status": status}),))
    db.commit()
    return jsonify({"status": "updated"})

@app.route("/admin/requests/<int:req_id>", methods=["DELETE"])
@require_admin
def delete_request(req_id):
    db = get_db()
    db.execute("DELETE FROM service_requests WHERE id=?", (req_id,))
    db.execute("INSERT INTO admin_logs (action, details) VALUES ('request_delete', ?)",
               (json.dumps({"id": req_id}),))
    db.commit()
    return jsonify({"status": "deleted"})

@app.route("/admin/requests/clear", methods=["DELETE"])
@require_admin
def clear_requests():
    db = get_db()
    db.execute("DELETE FROM service_requests")
    db.execute("INSERT INTO admin_logs (action, details) VALUES ('requests_cleared', '{}')")
    db.commit()
    return jsonify({"status": "cleared"})

@app.route("/admin/gallery", methods=["GET"])
@require_admin
def admin_gallery():
    photos = []
    if os.path.exists(UPLOAD_DIR):
        for f in sorted(os.listdir(UPLOAD_DIR)):
            if allowed_file(f) and not f.lower().endswith(".pdf"):
                photos.append({"filename": f, "url": f"/uploads/{f}"})
    return jsonify({"photos": photos})

@app.route("/admin/gallery", methods=["POST"])
@require_admin
def upload_photo():
    if "photo" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["photo"]
    if file.filename == "" or not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400
    filename = secure_filename(f"{uuid.uuid4().hex[:8]}_{file.filename}")
    file.save(os.path.join(UPLOAD_DIR, filename))
    return jsonify({"status": "uploaded", "filename": filename, "url": f"/uploads/{filename}"})

@app.route("/admin/gallery/<filename>", methods=["DELETE"])
@require_admin
def delete_photo(filename):
    filepath = os.path.join(UPLOAD_DIR, secure_filename(filename))
    if os.path.exists(filepath):
        os.remove(filepath)
    return jsonify({"status": "deleted"})

@app.route("/admin/gallery/clear", methods=["DELETE"])
@require_admin
def clear_gallery():
    if os.path.exists(UPLOAD_DIR):
        for f in os.listdir(UPLOAD_DIR):
            filepath = os.path.join(UPLOAD_DIR, f)
            if os.path.isfile(filepath):
                try:
                    os.remove(filepath)
                except Exception:
                    pass
    return jsonify({"status": "cleared"})


@app.route("/admin/stats")
@require_admin
def get_stats():
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    return jsonify({
        "total_messages": db.execute("SELECT COUNT(*) as c FROM chat_logs WHERE role='user'").fetchone()["c"],
        "total_sessions": db.execute("SELECT COUNT(*) as c FROM sessions").fetchone()["c"],
        "pending_requests": db.execute("SELECT COUNT(*) as c FROM service_requests WHERE status='pending'").fetchone()["c"],
        "total_requests": db.execute("SELECT COUNT(*) as c FROM service_requests").fetchone()["c"],
        "today_messages": db.execute("SELECT COUNT(*) as c FROM chat_logs WHERE role='user' AND date(created_at)=?", (today,)).fetchone()["c"],
        "today_requests": db.execute("SELECT COUNT(*) as c FROM service_requests WHERE date(created_at)=?", (today,)).fetchone()["c"],
    })

# ══════════════════════════════════════
#  SERVE FRONTEND
# ══════════════════════════════════════
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

@app.route("/")
@limiter.exempt
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/uploads/<path:filename>")
@limiter.exempt
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)

@app.route("/<path:filename>")
@limiter.exempt
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)

# ══════════════════════════════════════
#  RUN
# ══════════════════════════════════════
if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)