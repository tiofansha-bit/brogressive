from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import secrets
import hashlib
import logging
from html import escape
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, BackgroundTasks, UploadFile, File
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
ADMIN_ROLES = ("admin", "super_admin")
UPLOAD_DIR = Path("/app/backend/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "BROGRESSIVE"
EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "true").strip().lower() == "true"
GOOGLE_AUTH_ENABLED = os.environ.get("AUTH_GOOGLE_ENABLED", "true").strip().lower() == "true"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------- Security / Auth ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=60), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user: dict):
    ver = user.get("token_version", 0)
    response.set_cookie("access_token", create_access_token(user["user_id"], user["email"], ver),
                        httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user["user_id"], ver),
                        httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def pub(user: dict) -> dict:
    u = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return u


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if token:
        try:
            payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
                if user and payload.get("ver", 0) == user.get("token_version", 0):
                    if user.get("status", "active") != "active":
                        raise HTTPException(403, "Akun dinonaktifkan")
                    return user
        except jwt.InvalidTokenError:
            pass
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            session_token = auth[7:]
    if session_token:
        sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if sess:
            exp = sess["expires_at"]
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp > datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
                if user:
                    if user.get("status", "active") != "active":
                        raise HTTPException(403, "Akun dinonaktifkan")
                    return user
    raise HTTPException(401, "Tidak terautentikasi")


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Akses ditolak")
        return user
    return dep


require_admin = require_roles("admin", "super_admin")
require_coach = require_roles("coach", "admin", "super_admin")


async def require_client_access(user: dict, client_id: str):
    if user["role"] in ADMIN_ROLES:
        return
    if user["role"] == "client" and user["user_id"] == client_id:
        return
    if user["role"] == "coach":
        a = await db.assignments.find_one({"client_id": client_id, "coach_id": user["user_id"], "active": True})
        if a:
            return
    raise HTTPException(403, "Anda tidak memiliki akses ke klien ini")


async def audit(actor_id: str, action: str, entity: str, entity_id: str, detail: str = ""):
    await db.audit_logs.insert_one({"audit_id": new_id("aud"), "actor_id": actor_id, "action": action,
                                    "entity": entity, "entity_id": entity_id, "detail": detail,
                                    "created_at": now_iso()})


async def notify(user_id: str, ntype: str, title: str, body: str = "", link: str = ""):
    await db.notifications.insert_one({"notif_id": new_id("ntf"), "user_id": user_id, "type": ntype,
                                       "title": title, "body": body, "link": link, "read": False,
                                       "created_at": now_iso()})


# ---------- Email (password reset only) ----------

async def send_password_reset_email(to_email: str, token: str) -> bool:
    if not EMAIL_ENABLED:
        logger.info("Email disabled (EMAIL_ENABLED=false); skip reset email to %s", to_email)
        return False
    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
            f'<p>Kami menerima permintaan reset password akun {brand} Anda.</p>'
            f'<p><a href="{escape(link)}">Reset password Anda</a></p>'
            f'<p>Link berlaku 1 jam dan hanya bisa dipakai sekali. Abaikan email ini bila Anda tidak memintanya.</p>'
            f'<p style="font-size:12px;color:#888">Dikirim oleh {brand}.</p></td></tr></table>')
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                headers={"X-Email-Key": EMAIL_KEY},
                                json={"to": [to_email], "subject": f"Reset password {EMAIL_FROM_NAME}",
                                      "html": html, "from_name": EMAIL_FROM_NAME})
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Password reset email failed: {e}")
        return False


# ---------- App ----------
app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ AUTH ============

class RegisterIn(BaseModel):
    name: str
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


@api_router.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.strip().lower()
    if len(data.password) < 8:
        raise HTTPException(400, "Password minimal 8 karakter")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email sudah terdaftar")
    user = {"user_id": new_id("user"), "email": email, "name": data.name.strip(),
            "password_hash": hash_password(data.password), "role": "client", "status": "active",
            "picture": "", "auth_provider": "email", "token_version": 0, "created_at": now_iso()}
    await db.users.insert_one(user)
    set_auth_cookies(response, user)
    await audit(user["user_id"], "register", "user", user["user_id"])
    return pub(user)


@api_router.post("/auth/login")
async def login(data: LoginIn, request: Request, response: Response):
    email = data.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempts = await db.login_attempts.count_documents({
        "identifier": identifier,
        "created_at": {"$gt": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()}})
    if attempts >= 5:
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(data.password, user["password_hash"]):
        await db.login_attempts.insert_one({"identifier": identifier, "email": email, "created_at": now_iso()})
        raise HTTPException(401, "Email atau password salah")
    if user.get("status", "active") != "active":
        raise HTTPException(403, "Akun dinonaktifkan. Hubungi admin.")
    await db.login_attempts.delete_many({"identifier": identifier})
    set_auth_cookies(response, user)
    return pub(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    profile = await db.client_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    out = pub(user)
    out["onboarding_complete"] = bool(profile and profile.get("status") == "complete")
    return out


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    if not user or payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(401, "Session expired")
    response.set_cookie("access_token", create_access_token(user["user_id"], user["email"], user.get("token_version", 0)),
                        httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    return {"message": "refreshed"}


@api_router.post("/auth/forgot-password")
async def forgot_password(request: Request, background_tasks: BackgroundTasks):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    generic = {"message": "Jika email terdaftar, link reset telah dikirim."}
    if not EMAIL_ENABLED:
        return generic
    since = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    await db.password_reset_requests.insert_one({"email": email, "created_at": now_iso()})
    if await db.password_reset_requests.count_documents({"email": email, "created_at": {"$gt": since}}) > 5:
        return generic
    if await db.password_reset_requests.count_documents({"created_at": {"$gt": since}}) > 20:
        return generic
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        return generic
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token_hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": user["user_id"],
        "email": email, "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False})
    background_tasks.add_task(send_password_reset_email, user["email"], token)
    return generic


@api_router.post("/auth/reset-password")
async def reset_password(request: Request):
    body = await request.json()
    token = body.get("token") or ""
    password = body.get("password") or ""
    if len(password) < 8:
        raise HTTPException(400, "Password minimal 8 karakter")
    h = hashlib.sha256(token.encode()).hexdigest()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": h, "used": False, "expires_at": {"$gt": now_iso()}}, {"$set": {"used": True}})
    if not doc:
        raise HTTPException(400, "Link tidak valid atau sudah kedaluwarsa")
    await db.users.update_one({"user_id": doc["user_id"]},
                              {"$set": {"password_hash": hash_password(password)}, "$inc": {"token_version": 1}})
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"message": "Password berhasil diubah"}


@api_router.post("/auth/google-session")
async def google_session(request: Request, response: Response):
    if not GOOGLE_AUTH_ENABLED:
        raise HTTPException(503, "Login Google sedang dinonaktifkan. Gunakan email & password.")
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id required")
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                           headers={"X-Session-ID": session_id})
    if resp.status_code != 200:
        raise HTTPException(401, "Sesi Google tidak valid")
    data = resp.json()
    email = data["email"].strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = {"user_id": new_id("user"), "email": email, "name": data.get("name", email.split("@")[0]),
                "role": "client", "status": "active", "picture": data.get("picture", ""),
                "auth_provider": "google", "token_version": 0, "created_at": now_iso()}
        await db.users.insert_one(user)
        user.pop("_id", None)
        await audit(user["user_id"], "register_google", "user", user["user_id"])
    elif data.get("picture") and not user.get("picture"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"picture": data["picture"]}})
        user["picture"] = data["picture"]
    if user.get("status", "active") != "active":
        raise HTTPException(403, "Akun dinonaktifkan. Hubungi admin.")
    session_token = data["session_token"]
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    await db.user_sessions.insert_one({"user_id": user["user_id"], "session_token": session_token,
                                       "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                                       "created_at": datetime.now(timezone.utc)})
    response.set_cookie("session_token", session_token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")
    return pub(user)


# ============ APPEARANCE ============

DEFAULT_APPEARANCE = {
    "brand_name": "BROGRESSIVE",
    "tagline": "1 on 1 Online Coaching",
    "logo_url": "",
    "primary_color": "#FFFFFF",
    "accent_color": "#A3A3A3",
    "bg_color": "#0A0A0C",
    "bg_image": "",
    "hero_thumb": "",
    "hero_thumb_enabled": True,
    "hero_overlay": 70,
    "hero_position": "center",
    "font_heading": "Anton",
    "font_body": "Space Grotesk",
    "cta_login": "Masuk",
    "custom_fonts": [],
    "font_files": [],
    "hero_headline": "Bangun Versi Terkuat Dirimu.",
    "hero_subheadline": "Coaching bodybuilding 1-on-1 yang sistematis: nutrisi presisi, program latihan terperiodisasi, dan evaluasi mingguan bersama coach profesional.",
    "hero_cta": "Mulai Coaching",
    "hero_image": "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1ODF8MHwxfHNlYXJjaHwxfHxib2R5YnVpbGRlciUyMHRyYWluaW5nJTIwZ3ltJTIwZGFyayUyMG1vb2R8ZW58MHx8fHwxNzg5NDM4OTY2fDA&ixlib=rb-4.1.0&q=85",
    "about_title": "Coaching yang Terukur, Bukan Tebakan",
    "about_text": "Setiap program dibangun dari data: assessment awal, target makro individu, periodisasi latihan, dan review mingguan. Tidak ada template massal — semua disusun coach untuk Anda.",
    "services": [
        {"title": "Fat Loss & Recomposition", "desc": "Defisit terkontrol, protein optimal, dan monitoring tren berat mingguan."},
        {"title": "Muscle Gain", "desc": "Surplus terukur, progresi beban terstruktur, volume per otot terpantau."},
        {"title": "Contest Preparation", "desc": "Persiapan kompetisi dengan check-in ketat dan penyesuaian bertahap."},
    ],
    "testimonials": [
        {"name": "Rizky P.", "text": "Turun 12 kg dalam 16 minggu tanpa kehilangan massa otot. Programnya jelas dan coach selalu responsif."},
        {"name": "Andini S.", "text": "Check-in mingguan bikin konsisten. Pertama kali ngerasa diet punya arah."},
    ],
    "faq": [
        {"q": "Apakah cocok untuk pemula?", "a": "Ya. Program disesuaikan dengan level, alat yang tersedia, dan jadwal Anda."},
        {"q": "Bagaimana sistem check-in?", "a": "Setiap minggu Anda mengisi berat, foto progres, dan kepatuhan. Coach merespons dengan evaluasi dan penyesuaian program."},
        {"q": "Apakah ada rencana makan?", "a": "Ada. Target kalori dan makro personal, plus meal plan dengan makanan lokal Indonesia."},
    ],
    "contact": {"whatsapp": "", "email": "coach@brogressive.id", "address": "Jakarta, Indonesia"},
    "social": {"instagram": "", "tiktok": "", "youtube": ""},
    "seo": {"title": "BROGRESSIVE — 1 on 1 Online Bodybuilding Coaching",
            "description": "Coaching bodybuilding online 1-on-1: nutrisi, latihan, dan evaluasi mingguan.",
            "keywords": "coaching bodybuilding, online coach indonesia, fat loss, muscle gain"},
    "sections": {"hero": True, "about": True, "services": True, "testimonials": True, "faq": True, "contact": True},
    "footer_text": "© 2026 BROGRESSIVE. Coaching bukan pengganti layanan medis.",
    "login_welcome": "Selamat datang kembali. Saatnya progres.",
    "labels": {
        "about_eyebrow": "Tentang Kami",
        "services_eyebrow": "Layanan",
        "services_title": "Program Coaching",
        "testimonials_eyebrow": "Testimoni",
        "testimonials_title": "Kata Mereka",
        "faq_eyebrow": "FAQ",
        "faq_title": "Pertanyaan Umum",
    },
}

_logo_base = os.environ.get("FRONTEND_URL", "").rstrip("/")
if _logo_base:
    DEFAULT_APPEARANCE["logo_url"] = f"{_logo_base}/api/uploads/logo.jpg"


def merge_appearance(value):
    if not isinstance(value, dict):
        return dict(DEFAULT_APPEARANCE)
    out = {**DEFAULT_APPEARANCE, **value}
    for k in ("contact", "social", "seo", "sections", "labels"):
        out[k] = {**DEFAULT_APPEARANCE.get(k, {}), **(value.get(k) or {})}
    return out


@api_router.get("/appearance/published")
async def get_published_appearance():
    doc = await db.settings.find_one({"key": "appearance_published"}, {"_id": 0})
    return merge_appearance(doc["value"]) if doc else DEFAULT_APPEARANCE


@api_router.get("/appearance")
async def get_appearance(user: dict = Depends(require_admin)):
    draft = await db.settings.find_one({"key": "appearance_draft"}, {"_id": 0})
    published = await db.settings.find_one({"key": "appearance_published"}, {"_id": 0})
    versions = await db.settings.find_one({"key": "appearance_versions"}, {"_id": 0})
    return {"draft": merge_appearance(draft["value"]) if draft else (merge_appearance(published["value"]) if published else DEFAULT_APPEARANCE),
            "published": merge_appearance(published["value"]) if published else DEFAULT_APPEARANCE,
            "versions": versions["value"] if versions else []}


@api_router.put("/appearance")
async def save_appearance(request: Request, user: dict = Depends(require_admin)):
    value = await request.json()
    if not isinstance(value, dict):
        raise HTTPException(400, "Format tidak valid")
    value.pop("_id", None)
    await db.settings.update_one({"key": "appearance_draft"},
                                 {"$set": {"key": "appearance_draft", "value": value, "updated_by": user["user_id"], "updated_at": now_iso()}},
                                 upsert=True)
    await audit(user["user_id"], "appearance_save_draft", "settings", "appearance")
    return {"message": "Draft tersimpan"}


@api_router.post("/appearance/publish")
async def publish_appearance(user: dict = Depends(require_admin)):
    draft = await db.settings.find_one({"key": "appearance_draft"}, {"_id": 0})
    if not draft:
        raise HTTPException(400, "Tidak ada draft untuk dipublish")
    value = draft["value"]
    await db.settings.update_one({"key": "appearance_published"},
                                 {"$set": {"key": "appearance_published", "value": value, "published_by": user["user_id"], "published_at": now_iso()}},
                                 upsert=True)
    hist = await db.settings.find_one({"key": "appearance_versions"}, {"_id": 0})
    versions = (hist["value"] if hist else [])
    versions.insert(0, {"published_at": now_iso(), "published_by": user["user_id"], "value": value})
    versions = versions[:10]
    await db.settings.update_one({"key": "appearance_versions"}, {"$set": {"key": "appearance_versions", "value": versions}}, upsert=True)
    await audit(user["user_id"], "appearance_publish", "settings", "appearance")
    return {"message": "Appearance dipublish"}


@api_router.post("/appearance/reset")
async def reset_appearance(user: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "appearance_draft"},
                                 {"$set": {"key": "appearance_draft", "value": DEFAULT_APPEARANCE}}, upsert=True)
    await audit(user["user_id"], "appearance_reset", "settings", "appearance")
    return DEFAULT_APPEARANCE


# ============ ADMIN: USERS / ASSIGNMENTS / STATS / AUDIT ============

@api_router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_admin)):
    clients = await db.users.count_documents({"role": "client"})
    active_clients = await db.users.count_documents({"role": "client", "status": "active"})
    coaches = await db.users.count_documents({"role": "coach"})
    assigned_ids = await db.assignments.distinct("client_id", {"active": True})
    unassigned = await db.users.count_documents({"role": "client", "user_id": {"$nin": assigned_ids}})
    pending_checkins = await db.checkins.count_documents({"status": "submitted"})
    open_checkins = await db.checkins.count_documents({"status": "open"})
    active_nutrition = await db.nutrition_plans.count_documents({"status": "active"})
    active_training = await db.training_plans.count_documents({"status": "active"})
    payments_pending = await db.payment_proofs.count_documents({"status": "pending"})
    recent = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(15)
    return {"clients_total": clients, "clients_active": active_clients, "coaches": coaches,
            "unassigned_clients": unassigned, "checkins_awaiting_review": pending_checkins,
            "checkins_open": open_checkins, "active_nutrition_plans": active_nutrition,
            "active_training_plans": active_training, "payments_pending": payments_pending,
            "recent_activity": recent}


@api_router.get("/admin/users")
async def list_users(role: Optional[str] = None, q: Optional[str] = None, user: dict = Depends(require_admin)):
    query = {}
    if role:
        query["role"] = role
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"email": {"$regex": q, "$options": "i"}}]
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    assignments = await db.assignments.find({"active": True}, {"_id": 0}).to_list(1000)
    amap = {a["client_id"]: a for a in assignments}
    for u in users:
        a = amap.get(u["user_id"])
        u["assignment"] = a
    return users


class AdminUserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str


@api_router.post("/admin/users")
async def admin_create_user(data: AdminUserCreate, user: dict = Depends(require_admin)):
    if data.role not in ("admin", "coach", "client"):
        raise HTTPException(400, "Role tidak valid")
    if user["role"] != "super_admin" and data.role == "admin":
        pass  # admin boleh membuat admin (owner). super_admin-managed demotion tersedia lewat status.
    email = data.email.strip().lower()
    if len(data.password) < 8:
        raise HTTPException(400, "Password minimal 8 karakter")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email sudah terdaftar")
    new_user = {"user_id": new_id("user"), "email": email, "name": data.name.strip(),
                "password_hash": hash_password(data.password), "role": data.role, "status": "active",
                "picture": "", "auth_provider": "email", "token_version": 0,
                "created_at": now_iso(), "created_by": user["user_id"]}
    await db.users.insert_one(new_user)
    await audit(user["user_id"], "admin_create_user", "user", new_user["user_id"], f"role={data.role} email={email}")
    await notify(new_user["user_id"], "welcome", f"Akun {data.role} Anda telah dibuat", "Silakan login dan lengkapi profil.")
    return pub(new_user)


@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, request: Request, user: dict = Depends(require_admin)):
    body = await request.json()
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User tidak ditemukan")
    updates = {}
    if "status" in body and body["status"] in ("active", "suspended"):
        updates["status"] = body["status"]
    if "name" in body:
        updates["name"] = body["name"]
    if "password" in body and body["password"]:
        if len(body["password"]) < 8:
            raise HTTPException(400, "Password minimal 8 karakter")
        updates["password_hash"] = hash_password(body["password"])
        updates["token_version"] = target.get("token_version", 0) + 1
    if not updates:
        raise HTTPException(400, "Tidak ada perubahan")
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    await audit(user["user_id"], "admin_update_user", "user", user_id, str(list(updates.keys())))
    return {"message": "User diperbarui"}


@api_router.get("/admin/assignments")
async def list_assignments(user: dict = Depends(require_admin)):
    return await db.assignments.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/admin/assignments")
async def assign_client(request: Request, user: dict = Depends(require_admin)):
    body = await request.json()
    client_id, coach_id = body.get("client_id"), body.get("coach_id")
    cl = await db.users.find_one({"user_id": client_id, "role": "client"}, {"_id": 0})
    co = await db.users.find_one({"user_id": coach_id, "role": "coach"}, {"_id": 0})
    if not cl or not co:
        raise HTTPException(404, "Klien atau coach tidak ditemukan")
    await db.assignments.update_many({"client_id": client_id, "active": True}, {"$set": {"active": False, "ended_at": now_iso()}})
    doc = {"assignment_id": new_id("asg"), "client_id": client_id, "coach_id": coach_id,
           "coach_name": co["name"], "client_name": cl["name"], "active": True,
           "assigned_by": user["user_id"], "created_at": now_iso()}
    await db.assignments.insert_one(doc)
    doc.pop("_id", None)
    await audit(user["user_id"], "assign_client", "assignment", doc["assignment_id"], f"{cl['email']} -> {co['email']}")
    await notify(client_id, "assignment", "Anda telah terhubung dengan coach", f"Coach Anda: {co['name']}", "/app/coach")
    await notify(coach_id, "assignment", "Klien baru ditugaskan", f"Klien: {cl['name']}", f"/app/clients/{client_id}")
    return doc


@api_router.get("/admin/audit")
async def get_audit(user: dict = Depends(require_admin)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ============ PACKAGES & PAYMENTS ============

@api_router.get("/packages")
async def list_packages(user: dict = Depends(get_current_user)):
    return await db.packages.find({}, {"_id": 0}).to_list(100)


@api_router.post("/packages")
async def create_package(request: Request, user: dict = Depends(require_admin)):
    body = await request.json()
    doc = {"package_id": new_id("pkg"), "name": body.get("name", ""), "description": body.get("description", ""),
           "duration_weeks": int(body.get("duration_weeks", 4)), "checkin_frequency": body.get("checkin_frequency", "weekly"),
           "price_idr": int(body.get("price_idr", 0)), "features": body.get("features", []),
           "capacity": int(body.get("capacity", 50)), "active": bool(body.get("active", True)), "created_at": now_iso()}
    if not doc["name"]:
        raise HTTPException(400, "Nama paket wajib")
    await db.packages.insert_one(doc)
    doc.pop("_id", None)
    await audit(user["user_id"], "package_create", "package", doc["package_id"], doc["name"])
    return doc


@api_router.patch("/packages/{package_id}")
async def update_package(package_id: str, request: Request, user: dict = Depends(require_admin)):
    body = await request.json()
    body.pop("_id", None)
    body.pop("package_id", None)
    await db.packages.update_one({"package_id": package_id}, {"$set": body})
    await audit(user["user_id"], "package_update", "package", package_id)
    return {"message": "Paket diperbarui"}


@api_router.post("/admin/enrollments")
async def enroll_client(request: Request, user: dict = Depends(require_admin)):
    body = await request.json()
    client_id, package_id = body.get("client_id"), body.get("package_id")
    pkg = await db.packages.find_one({"package_id": package_id}, {"_id": 0})
    cl = await db.users.find_one({"user_id": client_id, "role": "client"}, {"_id": 0})
    if not pkg or not cl:
        raise HTTPException(404, "Paket atau klien tidak ditemukan")
    start = datetime.now(timezone.utc)
    end = start + timedelta(weeks=pkg["duration_weeks"])
    await db.enrollments.update_many({"client_id": client_id, "status": "active"}, {"$set": {"status": "replaced"}})
    doc = {"enrollment_id": new_id("enr"), "client_id": client_id, "client_name": cl["name"],
           "package_id": package_id, "package_name": pkg["name"], "start_date": start.isoformat(),
           "end_date": end.isoformat(), "status": "active", "created_by": user["user_id"], "created_at": now_iso()}
    await db.enrollments.insert_one(doc)
    doc.pop("_id", None)
    await audit(user["user_id"], "enroll", "enrollment", doc["enrollment_id"], f"{cl['email']} -> {pkg['name']}")
    await notify(client_id, "package", "Paket coaching aktif", f"Paket: {pkg['name']} hingga {end.date()}")
    return doc


@api_router.get("/enrollments")
async def list_enrollments(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if user["role"] == "client":
        query["client_id"] = user["user_id"]
    elif client_id:
        await require_client_access(user, client_id)
        query["client_id"] = client_id
    return await db.enrollments.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.post("/payments/proof")
async def upload_payment_proof(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    doc = {"proof_id": new_id("pay"), "client_id": user["user_id"], "client_name": user["name"],
           "package_id": body.get("package_id", ""), "package_name": body.get("package_name", ""),
           "file_url": body.get("file_url", ""), "note": body.get("note", ""), "status": "pending",
           "created_at": now_iso()}
    await db.payment_proofs.insert_one(doc)
    doc.pop("_id", None)
    admins = await db.users.find({"role": {"$in": list(ADMIN_ROLES)}}, {"_id": 0}).to_list(20)
    for a in admins:
        await notify(a["user_id"], "payment", "Bukti transfer baru", f"{user['name']} mengunggah bukti pembayaran", "/app/payments")
    return doc


@api_router.get("/admin/payments")
async def list_payments(user: dict = Depends(require_admin)):
    return await db.payment_proofs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api_router.patch("/admin/payments/{proof_id}")
async def review_payment(proof_id: str, request: Request, user: dict = Depends(require_admin)):
    body = await request.json()
    if body.get("status") not in ("verified", "rejected"):
        raise HTTPException(400, "Status tidak valid")
    await db.payment_proofs.update_one({"proof_id": proof_id}, {"$set": {"status": body["status"], "reviewed_by": user["user_id"], "reviewed_at": now_iso()}})
    proof = await db.payment_proofs.find_one({"proof_id": proof_id}, {"_id": 0})
    if proof:
        await notify(proof["client_id"], "payment", f"Pembayaran {body['status']}", f"Bukti transfer Anda: {body['status']}")
    await audit(user["user_id"], "payment_review", "payment", proof_id, body["status"])
    return {"message": "OK"}


# ============ ONBOARDING / PROFILE ============

REQUIRED_ONBOARDING = ["full_name", "birth_date", "gender", "height_cm", "weight_kg", "goal", "activity_level",
                       "training_days", "equipment", "meals_per_day", "parq_answered"]


def calc_completeness(data: dict) -> int:
    filled = sum(1 for k in REQUIRED_ONBOARDING if data.get(k) not in (None, "", []))
    return int(100 * filled / len(REQUIRED_ONBOARDING))


@api_router.get("/onboarding")
async def get_onboarding(user: dict = Depends(get_current_user)):
    uid = user["user_id"] if user["role"] == "client" else None
    if not uid:
        raise HTTPException(400, "Hanya klien")
    doc = await db.client_profiles.find_one({"user_id": uid}, {"_id": 0})
    return doc or {"user_id": uid, "data": {}, "completeness": 0, "status": "draft"}


@api_router.put("/onboarding")
async def save_onboarding(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien")
    body = await request.json()
    data = body.get("data", {})
    data.pop("_id", None)
    completeness = calc_completeness(data)
    parq_flag = bool(data.get("parq_flags"))
    await db.client_profiles.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"user_id": user["user_id"], "data": data, "completeness": completeness,
                  "parq_flag": parq_flag, "updated_at": now_iso()},
         "$setOnInsert": {"status": "draft", "created_at": now_iso()}},
        upsert=True)
    return {"completeness": completeness}


@api_router.post("/onboarding/complete")
async def complete_onboarding(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien")
    body = await request.json()
    data = body.get("data", {})
    if not body.get("consent"):
        raise HTTPException(400, "Persetujuan (consent) wajib dicentang")
    completeness = calc_completeness(data)
    if completeness < 100:
        raise HTTPException(400, f"Lengkapi data wajib terlebih dahulu ({completeness}%)")
    parq_flag = bool(data.get("parq_flags"))
    await db.client_profiles.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"user_id": user["user_id"], "data": data, "completeness": completeness,
                  "parq_flag": parq_flag, "consent": True, "consent_at": now_iso(),
                  "status": "complete", "updated_at": now_iso()}},
        upsert=True)
    await audit(user["user_id"], "onboarding_complete", "client_profile", user["user_id"])
    if parq_flag:
        asg = await db.assignments.find_one({"client_id": user["user_id"], "active": True}, {"_id": 0})
        flag = {"flag_id": new_id("flg"), "client_id": user["user_id"], "type": "parq_positive",
                "note": "Jawaban PAR-Q memerlukan perhatian. Medical clearance mungkin diperlukan sebelum program aktif.",
                "status": "open", "created_at": now_iso()}
        await db.safety_flags.insert_one(flag)
        if asg:
            await notify(asg["coach_id"], "safety", "Flag keselamatan baru", "PAR-Q positif pada klien baru", f"/app/clients/{user['user_id']}")
    return {"message": "Onboarding selesai", "completeness": completeness}


@api_router.get("/clients/{client_id}/profile")
async def get_client_profile(client_id: str, user: dict = Depends(get_current_user)):
    await require_client_access(user, client_id)
    doc = await db.client_profiles.find_one({"user_id": client_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Profil belum ada")
    return doc


# ============ COACH ============

@api_router.get("/coach/clients")
async def coach_clients(user: dict = Depends(require_coach)):
    if user["role"] in ADMIN_ROLES:
        assignments = await db.assignments.find({"active": True}, {"_id": 0}).to_list(1000)
    else:
        assignments = await db.assignments.find({"coach_id": user["user_id"], "active": True}, {"_id": 0}).to_list(1000)
    result = []
    for a in assignments:
        cl = await db.users.find_one({"user_id": a["client_id"]}, {"_id": 0, "password_hash": 0})
        if not cl:
            continue
        profile = await db.client_profiles.find_one({"user_id": a["client_id"]}, {"_id": 0})
        last_weight = await db.weight_logs.find_one({"client_id": a["client_id"]}, {"_id": 0}, sort=[("date", -1)])
        pending = await db.checkins.count_documents({"client_id": a["client_id"], "status": "submitted"})
        open_ci = await db.checkins.count_documents({"client_id": a["client_id"], "status": "open"})
        flags = await db.safety_flags.count_documents({"client_id": a["client_id"], "status": "open"})
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
        meal_days = len(await db.meal_logs.distinct("date", {"client_id": a["client_id"], "date": {"$gte": week_ago}}))
        result.append({"client": cl, "assignment": a,
                       "goal": (profile or {}).get("data", {}).get("goal", "-"),
                       "completeness": (profile or {}).get("completeness", 0),
                       "onboarding": (profile or {}).get("status", "draft"),
                       "last_weight": last_weight["weight"] if last_weight else None,
                       "pending_checkins": pending, "open_checkins": open_ci, "safety_flags": flags,
                       "adherence_7d": round(100 * meal_days / 7)})
    return result


@api_router.get("/clients/{client_id}/overview")
async def client_overview(client_id: str, user: dict = Depends(get_current_user)):
    await require_client_access(user, client_id)
    cl = await db.users.find_one({"user_id": client_id}, {"_id": 0, "password_hash": 0})
    profile = await db.client_profiles.find_one({"user_id": client_id}, {"_id": 0})
    assignment = await db.assignments.find_one({"client_id": client_id, "active": True}, {"_id": 0})
    enrollment = await db.enrollments.find_one({"client_id": client_id, "status": "active"}, {"_id": 0})
    nutrition = await db.nutrition_plans.find_one({"client_id": client_id, "status": "active"}, {"_id": 0}, sort=[("version", -1)])
    training = await db.training_plans.find_one({"client_id": client_id, "status": "active"}, {"_id": 0}, sort=[("version", -1)])
    weights = await db.weight_logs.find({"client_id": client_id}, {"_id": 0}).sort("date", -1).to_list(30)
    checkins = await db.checkins.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
    flags = await db.safety_flags.find({"client_id": client_id, "status": "open"}, {"_id": 0}).to_list(20)
    notes = []
    if user["role"] in ("coach",) + ADMIN_ROLES:
        notes = await db.coach_notes.find({"client_id": client_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"client": cl, "profile": profile, "assignment": assignment, "enrollment": enrollment,
            "active_nutrition": nutrition, "active_training": training, "weights": weights,
            "checkins": checkins, "safety_flags": flags, "coach_notes": notes}


@api_router.post("/clients/{client_id}/notes")
async def add_coach_note(client_id: str, request: Request, user: dict = Depends(require_coach)):
    await require_client_access(user, client_id)
    body = await request.json()
    doc = {"note_id": new_id("note"), "client_id": client_id, "coach_id": user["user_id"],
           "coach_name": user["name"], "text": body.get("text", ""), "created_at": now_iso()}
    if not doc["text"].strip():
        raise HTTPException(400, "Catatan kosong")
    await db.coach_notes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.post("/clients/{client_id}/flags/{flag_id}/resolve")
async def resolve_flag(client_id: str, flag_id: str, user: dict = Depends(require_coach)):
    await require_client_access(user, client_id)
    await db.safety_flags.update_one({"flag_id": flag_id}, {"$set": {"status": "resolved", "resolved_by": user["user_id"], "resolved_at": now_iso()}})
    return {"message": "Flag ditutup"}


# ============ FOODS & EXERCISES ============

@api_router.get("/foods")
async def list_foods(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    return await db.foods.find(query, {"_id": 0}).sort("name", 1).to_list(300)


@api_router.post("/foods")
async def create_food(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    for k in ("calories", "protein", "carbs", "fat", "fiber"):
        body[k] = max(0, float(body.get(k, 0) or 0))
    macro_cal = body["protein"] * 4 + body["carbs"] * 4 + body["fat"] * 9
    warning = None
    if body["calories"] > 0 and abs(macro_cal - body["calories"]) / max(body["calories"], 1) > 0.2:
        warning = f"Kalori dari makro ({round(macro_cal)}) tidak selaras dengan kalori input ({body['calories']})"
    doc = {"food_id": new_id("food"), "name": body.get("name", ""), "brand": body.get("brand", ""),
           "category": body.get("category", "custom"), "serving_size": body.get("serving_size", "100"),
           "serving_unit": body.get("serving_unit", "g"), "calories": body["calories"],
           "protein": body["protein"], "carbs": body["carbs"], "fat": body["fat"], "fiber": body["fiber"],
           "state": body.get("state", "raw"), "verified": False, "created_by": user["user_id"], "created_at": now_iso()}
    if not doc["name"]:
        raise HTTPException(400, "Nama makanan wajib")
    await db.foods.insert_one(doc)
    doc.pop("_id", None)
    return {"food": doc, "warning": warning}


@api_router.get("/exercises")
async def list_exercises(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    return await db.exercises.find(query, {"_id": 0}).sort("name", 1).to_list(300)


@api_router.post("/exercises")
async def create_exercise(request: Request, user: dict = Depends(require_coach)):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nama latihan wajib")
    dup = await db.exercises.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}, {"_id": 0})
    if dup:
        return dup
    doc = {"exercise_id": new_id("ex"), "name": name, "muscle_group": body.get("muscle_group", "other"),
           "equipment": body.get("equipment", "other"), "video_url": body.get("video_url", ""),
           "instructions": body.get("instructions", ""), "cues": body.get("cues", ""),
           "contraindication": body.get("contraindication", ""),
           "visibility": body.get("visibility", "shared"), "created_by": user["user_id"], "created_at": now_iso()}
    await db.exercises.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ============ PLANS (Nutrition & Training) ============

PLAN_COLLECTIONS = {"nutrition": "nutrition_plans", "training": "training_plans"}


def plan_targets_check(targets: dict):
    p = float(targets.get("protein", 0) or 0)
    c = float(targets.get("carbs", 0) or 0)
    f = float(targets.get("fat", 0) or 0)
    cal = float(targets.get("calories", 0) or 0)
    macro_cal = p * 4 + c * 4 + f * 9
    diff_pct = abs(macro_cal - cal) / max(cal, 1) * 100
    return macro_cal, diff_pct


@api_router.get("/plans/{kind}")
async def list_plans(kind: str, client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if kind not in PLAN_COLLECTIONS:
        raise HTTPException(404, "Tipe plan tidak valid")
    coll = db[PLAN_COLLECTIONS[kind]]
    if user["role"] == "client":
        docs = await coll.find({"client_id": user["user_id"], "status": {"$ne": "draft"}}, {"_id": 0}).sort("version", -1).to_list(100)
    else:
        query = {}
        if client_id:
            await require_client_access(user, client_id)
            query["client_id"] = client_id
        elif user["role"] == "coach":
            assigned = await db.assignments.distinct("client_id", {"coach_id": user["user_id"], "active": True})
            query["client_id"] = {"$in": assigned}
        docs = await coll.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api_router.post("/plans/{kind}")
async def create_plan(kind: str, request: Request, user: dict = Depends(require_coach)):
    if kind not in PLAN_COLLECTIONS:
        raise HTTPException(404, "Tipe plan tidak valid")
    body = await request.json()
    client_id = body.get("client_id")
    await require_client_access(user, client_id)
    content = body.get("content", {})
    doc = {"plan_id": new_id("plan"), "kind": kind, "client_id": client_id, "coach_id": user["user_id"],
           "coach_name": user["name"], "name": body.get("name", "Plan Baru"), "version": 1,
           "status": "draft", "content": content, "start_date": body.get("start_date", ""),
           "end_date": body.get("end_date", ""), "notes": body.get("notes", ""),
           "change_reason": body.get("change_reason", ""), "parent_plan_id": body.get("parent_plan_id"),
           "created_at": now_iso(), "updated_at": now_iso()}
    await db[PLAN_COLLECTIONS[kind]].insert_one(doc)
    doc.pop("_id", None)
    await audit(user["user_id"], f"plan_create_{kind}", "plan", doc["plan_id"], doc["name"])
    return doc


@api_router.put("/plans/{kind}/{plan_id}")
async def update_plan(kind: str, plan_id: str, request: Request, user: dict = Depends(require_coach)):
    if kind not in PLAN_COLLECTIONS:
        raise HTTPException(404, "Tipe plan tidak valid")
    plan = await db[PLAN_COLLECTIONS[kind]].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan tidak ditemukan")
    await require_client_access(user, plan["client_id"])
    if plan["status"] not in ("draft", "scheduled"):
        raise HTTPException(400, "Hanya draft yang bisa diubah. Buat revisi versi baru.")
    body = await request.json()
    updates = {"updated_at": now_iso()}
    for k in ("name", "content", "start_date", "end_date", "notes", "change_reason"):
        if k in body:
            updates[k] = body[k]
    await db[PLAN_COLLECTIONS[kind]].update_one({"plan_id": plan_id}, {"$set": updates})
    return {"message": "Plan diperbarui"}


@api_router.post("/plans/{kind}/{plan_id}/publish")
async def publish_plan(kind: str, plan_id: str, request: Request, user: dict = Depends(require_coach)):
    if kind not in PLAN_COLLECTIONS:
        raise HTTPException(404, "Tipe plan tidak valid")
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    plan = await db[PLAN_COLLECTIONS[kind]].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan tidak ditemukan")
    await require_client_access(user, plan["client_id"])
    if plan["status"] == "active":
        raise HTTPException(400, "Plan sudah aktif")
    profile = await db.client_profiles.find_one({"user_id": plan["client_id"]}, {"_id": 0})
    if not profile or profile.get("status") != "complete":
        raise HTTPException(400, "Onboarding klien belum selesai. Plan tidak bisa dipublish.")
    if kind == "nutrition":
        targets = plan.get("content", {}).get("targets", {})
        macro_cal, diff_pct = plan_targets_check(targets)
        if diff_pct > 10 and not body.get("confirm"):
            raise HTTPException(409, f"Selisih kalori makro ({round(macro_cal)} kkal) vs target ({targets.get('calories', 0)} kkal) = {round(diff_pct)}%. Kirim ulang dengan confirm=true untuk tetap publish.")
    coll = db[PLAN_COLLECTIONS[kind]]
    await coll.update_many({"client_id": plan["client_id"], "status": "active"},
                           {"$set": {"status": "completed", "completed_at": now_iso()}})
    await coll.update_one({"plan_id": plan_id},
                          {"$set": {"status": "active", "published_at": now_iso(), "published_by": user["user_id"]}})
    await audit(user["user_id"], f"plan_publish_{kind}", "plan", plan_id, f"v{plan['version']} {plan.get('change_reason','')}")
    await notify(plan["client_id"], "plan_published",
                 f"Program {'nutrisi' if kind == 'nutrition' else 'latihan'} baru aktif",
                 f"{plan['name']} (v{plan['version']})", "/app/program")
    return {"message": "Plan dipublish dan aktif"}


@api_router.post("/plans/{kind}/{plan_id}/revise")
async def revise_plan(kind: str, plan_id: str, request: Request, user: dict = Depends(require_coach)):
    if kind not in PLAN_COLLECTIONS:
        raise HTTPException(404, "Tipe plan tidak valid")
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    plan = await db[PLAN_COLLECTIONS[kind]].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan tidak ditemukan")
    await require_client_access(user, plan["client_id"])
    latest = await db[PLAN_COLLECTIONS[kind]].find_one({"client_id": plan["client_id"]}, {"_id": 0}, sort=[("version", -1)])
    doc = {"plan_id": new_id("plan"), "kind": kind, "client_id": plan["client_id"], "coach_id": user["user_id"],
           "coach_name": user["name"], "name": plan["name"], "version": (latest["version"] if latest else plan["version"]) + 1,
           "status": "draft", "content": plan.get("content", {}), "start_date": plan.get("start_date", ""),
           "end_date": plan.get("end_date", ""), "notes": plan.get("notes", ""),
           "change_reason": body.get("change_reason", ""), "parent_plan_id": plan_id,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db[PLAN_COLLECTIONS[kind]].insert_one(doc)
    doc.pop("_id", None)
    await audit(user["user_id"], f"plan_revise_{kind}", "plan", doc["plan_id"], f"from v{plan['version']}")
    return doc


@api_router.post("/plans/{kind}/{plan_id}/archive")
async def archive_plan(kind: str, plan_id: str, user: dict = Depends(require_coach)):
    if kind not in PLAN_COLLECTIONS:
        raise HTTPException(404, "Tipe plan tidak valid")
    plan = await db[PLAN_COLLECTIONS[kind]].find_one({"plan_id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan tidak ditemukan")
    await require_client_access(user, plan["client_id"])
    await db[PLAN_COLLECTIONS[kind]].update_one({"plan_id": plan_id}, {"$set": {"status": "archived", "archived_at": now_iso()}})
    return {"message": "Plan diarsipkan"}


# ============ LOGS ============

@api_router.post("/logs/weight")
async def log_weight(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien")
    w = float(body.get("weight", 0))
    if w <= 20 or w >= 400:
        raise HTTPException(400, "Berat tidak valid")
    date = body.get("date") or datetime.now(timezone.utc).date().isoformat()
    await db.weight_logs.update_one({"client_id": user["user_id"], "date": date},
                                    {"$set": {"client_id": user["user_id"], "date": date, "weight": w,
                                              "log_id": new_id("wlog"), "created_at": now_iso()}}, upsert=True)
    return {"message": "Berat tercatat"}


@api_router.post("/logs/meal")
async def log_meal(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien")
    date = body.get("date") or datetime.now(timezone.utc).date().isoformat()
    doc = {"log_id": new_id("mlog"), "client_id": user["user_id"], "date": date,
           "name": body.get("name", "Meal"), "items": body.get("items", []),
           "calories": float(body.get("calories", 0) or 0), "protein": float(body.get("protein", 0) or 0),
           "carbs": float(body.get("carbs", 0) or 0), "fat": float(body.get("fat", 0) or 0),
           "photo_url": body.get("photo_url", ""), "note": body.get("note", ""),
           "hunger": body.get("hunger"), "created_at": now_iso()}
    await db.meal_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.post("/logs/workout")
async def log_workout(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien")
    date = body.get("date") or datetime.now(timezone.utc).date().isoformat()
    doc = {"log_id": new_id("wout"), "client_id": user["user_id"], "date": date,
           "plan_id": body.get("plan_id", ""), "day_label": body.get("day_label", ""),
           "exercises": body.get("exercises", []), "duration_min": int(body.get("duration_min", 0) or 0),
           "difficulty": body.get("difficulty"), "pain_flag": bool(body.get("pain_flag")),
           "notes": body.get("notes", ""), "created_at": now_iso()}
    await db.workout_logs.insert_one(doc)
    doc.pop("_id", None)
    if doc["pain_flag"]:
        asg = await db.assignments.find_one({"client_id": user["user_id"], "active": True}, {"_id": 0})
        await db.safety_flags.insert_one({"flag_id": new_id("flg"), "client_id": user["user_id"],
                                          "type": "pain_report", "note": f"Klien melaporkan nyeri saat latihan: {doc['day_label']}",
                                          "status": "open", "created_at": now_iso()})
        if asg:
            await notify(asg["coach_id"], "safety", "Laporan nyeri saat latihan", doc["day_label"], f"/app/clients/{user['user_id']}")
    return doc


@api_router.get("/logs/{kind}")
async def get_logs(kind: str, client_id: Optional[str] = None, days: int = 30, user: dict = Depends(get_current_user)):
    collmap = {"weight": "weight_logs", "meal": "meal_logs", "workout": "workout_logs", "daily": "daily_logs"}
    if kind not in collmap:
        raise HTTPException(404, "Tipe log tidak valid")
    if user["role"] == "client":
        cid = user["user_id"]
    else:
        if not client_id:
            raise HTTPException(400, "client_id wajib")
        await require_client_access(user, client_id)
        cid = client_id
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    return await db[collmap[kind]].find({"client_id": cid, "date": {"$gte": since}}, {"_id": 0}).sort("date", -1).to_list(500)


@api_router.post("/logs/daily")
async def log_daily(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien")
    date = body.get("date") or datetime.now(timezone.utc).date().isoformat()
    allowed = {k: body[k] for k in ("water_ml", "steps", "sleep_hours", "sleep_quality", "stress", "energy",
                                    "cardio_done", "cardio_note", "habits") if k in body}
    await db.daily_logs.update_one({"client_id": user["user_id"], "date": date},
                                   {"$set": {**allowed, "client_id": user["user_id"], "date": date,
                                             "updated_at": now_iso()},
                                    "$setOnInsert": {"log_id": new_id("dlog"), "created_at": now_iso()}}, upsert=True)
    return {"message": "Tercatat"}


@api_router.get("/clients/{client_id}/progress")
async def client_progress(client_id: str, days: int = 30, user: dict = Depends(get_current_user)):
    await require_client_access(user, client_id)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    weights = await db.weight_logs.find({"client_id": client_id, "date": {"$gte": since}}, {"_id": 0}).sort("date", 1).to_list(500)
    meals = await db.meal_logs.find({"client_id": client_id, "date": {"$gte": since}}, {"_id": 0}).sort("date", 1).to_list(1000)
    workouts = await db.workout_logs.find({"client_id": client_id, "date": {"$gte": since}}, {"_id": 0}).sort("date", 1).to_list(500)
    daily = await db.daily_logs.find({"client_id": client_id, "date": {"$gte": since}}, {"_id": 0}).sort("date", 1).to_list(500)
    # rolling 7-day average
    series = []
    for i, w in enumerate(weights):
        window = [x["weight"] for x in weights[max(0, i - 6):i + 1]]
        series.append({"date": w["date"], "weight": w["weight"], "avg7": round(sum(window) / len(window), 1)})
    meal_days = {}
    for m in meals:
        d = meal_days.setdefault(m["date"], {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "count": 0})
        d["calories"] += m.get("calories", 0); d["protein"] += m.get("protein", 0)
        d["carbs"] += m.get("carbs", 0); d["fat"] += m.get("fat", 0); d["count"] += 1
    nutrition = [{"date": k, **{kk: round(vv, 1) for kk, vv in v.items()}} for k, v in sorted(meal_days.items())]
    return {"weight_series": series, "nutrition_daily": nutrition,
            "workouts": [{"date": w["date"], "day_label": w["day_label"], "duration_min": w["duration_min"],
                          "exercises": w["exercises"], "pain_flag": w.get("pain_flag")} for w in workouts],
            "daily": daily}


# ============ CHECK-INS ============

SAFETY_KEYWORDS = ["nyeri dada", "pingsan", "sesak napas", "sesak berat", "bunuh diri", "menyakiti diri",
                   "chest pain", "suicide", "self-harm", "pusing berat", "kejang"]


@api_router.post("/checkins/open")
async def open_checkin(request: Request, user: dict = Depends(require_coach)):
    body = await request.json()
    client_id = body.get("client_id")
    await require_client_access(user, client_id)
    existing = await db.checkins.find_one({"client_id": client_id, "status": {"$in": ["open", "submitted"]}}, {"_id": 0})
    if existing:
        return existing
    doc = {"checkin_id": new_id("chk"), "client_id": client_id, "coach_id": user["user_id"],
           "week_of": body.get("week_of") or datetime.now(timezone.utc).date().isoformat(),
           "status": "open", "data": {}, "photos": [], "coach_response": None,
           "created_at": now_iso(), "due_date": body.get("due_date") or (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()}
    await db.checkins.insert_one(doc)
    doc.pop("_id", None)
    await notify(client_id, "checkin_due", "Check-in mingguan dibuka", "Silakan isi check-in Anda", "/app/checkin")
    return doc


@api_router.get("/checkins")
async def list_checkins(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        query = {"client_id": user["user_id"]}
    else:
        query = {}
        if client_id:
            await require_client_access(user, client_id)
            query["client_id"] = client_id
        elif user["role"] == "coach":
            query["coach_id"] = user["user_id"]
    return await db.checkins.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)


@api_router.get("/checkins/{checkin_id}")
async def get_checkin(checkin_id: str, user: dict = Depends(get_current_user)):
    doc = await db.checkins.find_one({"checkin_id": checkin_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Check-in tidak ditemukan")
    await require_client_access(user, doc["client_id"])
    return doc


@api_router.put("/checkins/{checkin_id}")
async def submit_checkin(checkin_id: str, request: Request, user: dict = Depends(get_current_user)):
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien")
    doc = await db.checkins.find_one({"checkin_id": checkin_id}, {"_id": 0})
    if not doc or doc["client_id"] != user["user_id"]:
        raise HTTPException(404, "Check-in tidak ditemukan")
    if doc["status"] not in ("open",):
        raise HTTPException(400, "Check-in sudah dikirim")
    body = await request.json()
    data = body.get("data", {})
    photos = body.get("photos", [])
    combined_text = " ".join(str(v) for v in data.values()).lower()
    hit = next((kw for kw in SAFETY_KEYWORDS if kw in combined_text), None)
    await db.checkins.update_one({"checkin_id": checkin_id},
                                 {"$set": {"data": data, "photos": photos, "status": "submitted",
                                           "submitted_at": now_iso()}})
    await notify(doc["coach_id"], "checkin_submitted", "Check-in masuk", f"{user['name']} mengirim check-in", f"/app/clients/{user['user_id']}")
    if hit:
        await db.safety_flags.insert_one({"flag_id": new_id("flg"), "client_id": user["user_id"],
                                          "type": "checkin_keyword", "note": f"Kata kunci keselamatan terdeteksi: '{hit}'. Tinjau segera.",
                                          "status": "open", "created_at": now_iso()})
        await notify(doc["coach_id"], "safety", "Sinyal keselamatan pada check-in", f"Tinjau check-in {user['name']}", f"/app/clients/{user['user_id']}")
    return {"message": "Check-in terkirim", "safety_flag": bool(hit)}


@api_router.post("/checkins/{checkin_id}/respond")
async def respond_checkin(checkin_id: str, request: Request, user: dict = Depends(require_coach)):
    body = await request.json()
    doc = await db.checkins.find_one({"checkin_id": checkin_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Check-in tidak ditemukan")
    await require_client_access(user, doc["client_id"])
    if doc["status"] != "submitted":
        raise HTTPException(400, "Check-in belum dikirim klien")
    response_doc = {"text": body.get("text", ""), "adjustments": body.get("adjustments", ""),
                    "next_focus": body.get("next_focus", ""), "responded_by": user["user_id"],
                    "responded_at": now_iso()}
    await db.checkins.update_one({"checkin_id": checkin_id},
                                 {"$set": {"coach_response": response_doc, "status": "responded"}})
    await audit(user["user_id"], "checkin_respond", "checkin", checkin_id)
    await notify(doc["client_id"], "checkin_reviewed", "Coach merespons check-in Anda",
                 response_doc["text"][:120], "/app/progres")
    return {"message": "Respons terkirim"}


# ============ MESSAGES ============

@api_router.get("/messages/threads")
async def message_threads(user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        asg = await db.assignments.find_one({"client_id": user["user_id"], "active": True}, {"_id": 0})
        partners = [asg["coach_id"]] if asg else []
    elif user["role"] == "coach":
        partners = await db.assignments.distinct("client_id", {"coach_id": user["user_id"], "active": True})
    else:
        partners = await db.assignments.distinct("client_id", {"active": True})
    threads = []
    for pid in partners:
        p = await db.users.find_one({"user_id": pid}, {"_id": 0, "password_hash": 0})
        if not p:
            continue
        last = await db.messages.find_one({"$or": [{"from_id": user["user_id"], "to_id": pid},
                                                   {"from_id": pid, "to_id": user["user_id"]}]},
                                          {"_id": 0}, sort=[("created_at", -1)])
        unread = await db.messages.count_documents({"from_id": pid, "to_id": user["user_id"], "read": False})
        threads.append({"partner": p, "last_message": last, "unread": unread})
    return threads


@api_router.get("/messages/{other_id}")
async def get_messages(other_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        await require_client_access(user, user["user_id"])
    elif user["role"] == "coach":
        await require_client_access(user, other_id if other_id != user["user_id"] else user["user_id"])
    await db.messages.update_many({"from_id": other_id, "to_id": user["user_id"]}, {"$set": {"read": True}})
    msgs = await db.messages.find({"$or": [{"from_id": user["user_id"], "to_id": other_id},
                                           {"from_id": other_id, "to_id": user["user_id"]}]},
                                  {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs


@api_router.post("/messages")
async def send_message(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    to_id = body.get("to_id")
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Pesan kosong")
    target = await db.users.find_one({"user_id": to_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Penerima tidak ditemukan")
    if user["role"] == "client":
        asg = await db.assignments.find_one({"client_id": user["user_id"], "coach_id": to_id, "active": True})
        if not asg and target["role"] not in ADMIN_ROLES:
            raise HTTPException(403, "Anda hanya bisa mengirim pesan ke coach Anda")
    elif user["role"] == "coach":
        asg = await db.assignments.find_one({"client_id": to_id, "coach_id": user["user_id"], "active": True})
        if not asg:
            raise HTTPException(403, "Klien ini tidak ditugaskan kepada Anda")
    doc = {"message_id": new_id("msg"), "from_id": user["user_id"], "from_name": user["name"],
           "to_id": to_id, "text": text, "attachment_url": body.get("attachment_url", ""),
           "read": False, "created_at": now_iso()}
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    await notify(to_id, "message", f"Pesan dari {user['name']}", text[:100])
    return doc


# ============ NOTIFICATIONS ============

@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    return await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)


@api_router.post("/notifications/read-all")
async def read_all_notifications(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"message": "OK"}


# ============ ENHANCED (self-report only) ============

@api_router.post("/enhanced")
async def log_enhanced(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] != "client":
        raise HTTPException(400, "Hanya klien (self-report)")
    body = await request.json()
    doc = {"entry_id": new_id("enh"), "client_id": user["user_id"],
           "week_of": body.get("week_of") or datetime.now(timezone.utc).date().isoformat(),
           "entries": body.get("entries", []), "notes": body.get("notes", ""),
           "provenance": "self_report", "created_at": now_iso()}
    await db.enhanced_logs.insert_one(doc)
    doc.pop("_id", None)
    asg = await db.assignments.find_one({"client_id": user["user_id"], "active": True}, {"_id": 0})
    if asg:
        await notify(asg["coach_id"], "enhanced", "Self-report enhanced mingguan", f"{user['name']} mengisi catatan enhanced", f"/app/clients/{user['user_id']}")
    return doc


@api_router.get("/enhanced")
async def get_enhanced(client_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    if user["role"] == "client":
        cid = user["user_id"]
    else:
        if not client_id:
            raise HTTPException(400, "client_id wajib")
        await require_client_access(user, client_id)
        cid = client_id
    return await db.enhanced_logs.find({"client_id": cid}, {"_id": 0}).sort("week_of", -1).to_list(100)


# ============ UPLOADS ============

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".otf", ".ttf", ".woff", ".woff2"}


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "Format file tidak didukung (png/jpg/webp/pdf/otf/ttf/woff/woff2)")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "File maksimal 8MB")
    fname = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / fname).write_bytes(content)
    return {"url": f"/api/uploads/{fname}"}


# ============ SEED & STARTUP ============

SEED_FOODS = [
    ("Nasi Putih (masak)", "100", "g", 175, 3.2, 40, 0.2, 0.4, "cooked", "karbo"),
    ("Nasi Merah (masak)", "100", "g", 150, 3.0, 32, 1.2, 1.8, "cooked", "karbo"),
    ("Dada Ayam Tanpa Kulit (rebus)", "100", "g", 165, 31, 0, 3.6, 0, "cooked", "protein"),
    ("Paha Ayam Tanpa Kulit", "100", "g", 209, 26, 0, 10.9, 0, "cooked", "protein"),
    ("Telur Ayam Rebus", "1", "butir (55g)", 78, 6.3, 0.6, 5.3, 0, "cooked", "protein"),
    ("Tempe (kukus)", "100", "g", 192, 20, 8, 8, 1.4, "cooked", "protein"),
    ("Tahu Putih", "100", "g", 80, 8, 1.9, 4.2, 0.3, "raw", "protein"),
    ("Ikan Kembung (goreng tanpa minyak)", "100", "g", 180, 22, 0, 9, 0, "cooked", "protein"),
    ("Ikan Nila (panggang)", "100", "g", 128, 26, 0, 2.7, 0, "cooked", "protein"),
    ("Daging Sapi Tanpa Lemak", "100", "g", 187, 27, 0, 8, 0, "cooked", "protein"),
    ("Putih Telur", "100", "g", 52, 11, 0.7, 0.2, 0, "raw", "protein"),
    ("Ubi Jalar (rebus)", "100", "g", 86, 1.6, 20, 0.1, 3, "cooked", "karbo"),
    ("Singkong (rebus)", "100", "g", 160, 1.4, 38, 0.3, 1.8, "cooked", "karbo"),
    ("Oatmeal (kering)", "40", "g", 150, 5, 27, 2.5, 4, "raw", "karbo"),
    ("Roti Gandum", "1", "lembar (35g)", 90, 4, 15, 1.5, 2, "raw", "karbo"),
    ("Pisang Ambon", "1", "buah sedang (120g)", 105, 1.3, 27, 0.4, 3.1, "raw", "buah"),
    ("Pepaya", "100", "g", 43, 0.5, 11, 0.3, 1.7, "raw", "buah"),
    ("Alpukat", "100", "g", 160, 2, 9, 15, 7, "raw", "lemak"),
    ("Kacang Tanah (rebus)", "30", "g", 170, 7, 5, 14, 2.5, "cooked", "lemak"),
    ("Susu Sapi Full Cream", "250", "ml", 150, 8, 12, 8, 0, "raw", "dairy"),
    ("Susu Skim / Low Fat", "250", "ml", 90, 9, 12, 0.5, 0, "raw", "dairy"),
    ("Whey Protein (1 scoop)", "30", "g", 120, 24, 3, 1.5, 0, "raw", "suplemen"),
    ("Sayur Bayam Bening", "100", "g", 25, 3, 3.5, 0.5, 2.2, "cooked", "sayur"),
    ("Brokoli (kukus)", "100", "g", 35, 2.4, 7, 0.4, 2.6, "cooked", "sayur"),
    ("Kentang (rebus)", "100", "g", 87, 1.9, 20, 0.1, 1.8, "cooked", "karbo"),
    ("Minyak Zaitun", "10", "ml", 90, 0, 0, 10, 0, "raw", "lemak"),
]

SEED_EXERCISES = [
    ("Barbell Back Squat", "legs", "barbell"), ("Barbell Bench Press", "chest", "barbell"),
    ("Conventional Deadlift", "back", "barbell"), ("Overhead Press", "shoulders", "barbell"),
    ("Barbell Row", "back", "barbell"), ("Romanian Deadlift", "hamstrings", "barbell"),
    ("Lat Pulldown", "back", "machine"), ("Pull-Up", "back", "bodyweight"),
    ("Incline Dumbbell Press", "chest", "dumbbell"), ("Seated Cable Row", "back", "cable"),
    ("Leg Press", "legs", "machine"), ("Leg Curl", "hamstrings", "machine"),
    ("Leg Extension", "quads", "machine"), ("Hip Thrust", "glutes", "barbell"),
    ("Lateral Raise", "shoulders", "dumbbell"), ("Face Pull", "rear_delts", "cable"),
    ("Dumbbell Bicep Curl", "biceps", "dumbbell"), ("Tricep Rope Pushdown", "triceps", "cable"),
    ("Chest Dip", "chest", "bodyweight"), ("Standing Calf Raise", "calves", "machine"),
    ("Plank", "core", "bodyweight"), ("Walking Lunge", "legs", "dumbbell"),
]


async def seed_data():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({"user_id": new_id("user"), "email": admin_email,
                                   "name": "Tio Fansha", "password_hash": hash_password(admin_password),
                                   "role": "admin", "status": "active", "picture": "",
                                   "auth_provider": "email", "token_version": 0, "created_at": now_iso()})
        logger.info("Seeded admin %s", admin_email)
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
    if await db.foods.count_documents({}) == 0:
        await db.foods.insert_many([
            {"food_id": new_id("food"), "name": n, "brand": "", "category": cat,
             "serving_size": ss, "serving_unit": su, "calories": cal, "protein": p, "carbs": c,
             "fat": f, "fiber": fib, "state": state, "verified": True, "created_by": "seed",
             "created_at": now_iso()}
            for (n, ss, su, cal, p, c, f, fib, state, cat) in SEED_FOODS])
        logger.info("Seeded foods")
    if await db.exercises.count_documents({}) == 0:
        await db.exercises.insert_many([
            {"exercise_id": new_id("ex"), "name": n, "muscle_group": mg, "equipment": eq,
             "video_url": "", "instructions": "", "cues": "", "contraindication": "",
             "visibility": "shared", "created_by": "seed", "created_at": now_iso()}
            for (n, mg, eq) in SEED_EXERCISES])
        logger.info("Seeded exercises")
    if await db.packages.count_documents({}) == 0:
        await db.packages.insert_one({"package_id": new_id("pkg"), "name": "Online Coaching 12 Minggu",
                                      "description": "Coaching 1-on-1: nutrition plan, training plan, check-in mingguan, chat coach.",
                                      "duration_weeks": 12, "checkin_frequency": "weekly", "price_idr": 1500000,
                                      "features": ["Nutrition plan personal", "Training plan terperiodisasi", "Check-in mingguan", "Chat coach"], "capacity": 50, "active": True, "created_at": now_iso()})


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_requests.create_index("created_at", expireAfterSeconds=900)
    await db.login_attempts.create_index("identifier")
    await db.login_attempts.create_index("email")
    await db.user_sessions.create_index("session_token", unique=True)
    await db.assignments.create_index([("client_id", 1), ("active", 1)])
    await db.messages.create_index([("from_id", 1), ("to_id", 1)])
    await db.notifications.create_index("user_id")
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
