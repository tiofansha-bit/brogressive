"""
BROGRESSIVE Backend E2E Tests
Covers: auth, admin (users/assignments/appearance/packages), onboarding,
plans (nutrition/training publish + 409), logs, check-ins, messages, enhanced,
RBAC negatives, payments.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://coach-athlete-hub-14.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "tiofansha@gmail.com"
ADMIN_PASSWORD = "Brogressive#2026"

# Unique per-run for isolation
RUN = uuid.uuid4().hex[:6]
COACH_EMAIL = f"test_coach_{RUN}@test.com"
COACH_PASSWORD = "Coach12345"
CLIENT_EMAIL = f"test_client_{RUN}@test.com"
CLIENT_PASSWORD = "Client12345"


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    _login(s, ADMIN_EMAIL, ADMIN_PASSWORD)
    return s


@pytest.fixture(scope="session")
def state():
    return {}


# ---------- Auth ----------
class TestAuth:
    def test_health_appearance_public(self):
        r = requests.get(f"{API}/appearance/published")
        assert r.status_code == 200
        assert "brand_name" in r.json()

    def test_admin_login(self, admin):
        r = admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == ADMIN_EMAIL
        assert me["role"] in ("admin", "super_admin")

    def test_unauthenticated_me_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpass"})
        assert r.status_code == 401


# ---------- Admin: user create + assignment ----------
class TestAdminUsers:
    def test_create_coach(self, admin, state):
        r = admin.post(f"{API}/admin/users", json={
            "name": "Test Coach", "email": COACH_EMAIL,
            "password": COACH_PASSWORD, "role": "coach"})
        assert r.status_code == 200, r.text
        state["coach"] = r.json()
        assert state["coach"]["role"] == "coach"

    def test_create_client(self, admin, state):
        r = admin.post(f"{API}/admin/users", json={
            "name": "Test Client", "email": CLIENT_EMAIL,
            "password": CLIENT_PASSWORD, "role": "client"})
        assert r.status_code == 200, r.text
        state["client"] = r.json()

    def test_duplicate_email_rejected(self, admin):
        r = admin.post(f"{API}/admin/users", json={
            "name": "Dup", "email": COACH_EMAIL, "password": "Passwrd123", "role": "coach"})
        assert r.status_code == 400

    def test_admin_stats(self, admin):
        r = admin.get(f"{API}/admin/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("clients_total", "coaches", "unassigned_clients", "recent_activity"):
            assert k in d

    def test_assign_client_to_coach(self, admin, state):
        r = admin.post(f"{API}/admin/assignments", json={
            "client_id": state["client"]["user_id"],
            "coach_id": state["coach"]["user_id"]})
        assert r.status_code == 200, r.text
        assert r.json()["active"] is True


# ---------- Appearance ----------
class TestAppearance:
    def test_get_appearance(self, admin, state):
        r = admin.get(f"{API}/appearance")
        assert r.status_code == 200
        state["appearance_draft"] = r.json()["draft"]

    def test_save_draft_and_publish(self, admin, state):
        draft = dict(state["appearance_draft"])
        draft["brand_name"] = f"BROG-TEST-{RUN}"
        draft["hero_headline"] = "Headline Test"
        draft["primary_color"] = "#FF2E00"
        r = admin.put(f"{API}/appearance", json=draft)
        assert r.status_code == 200

        r = admin.post(f"{API}/appearance/publish")
        assert r.status_code == 200

        r = requests.get(f"{API}/appearance/published")
        assert r.status_code == 200
        pub = r.json()
        assert pub["brand_name"] == f"BROG-TEST-{RUN}"
        assert pub["hero_headline"] == "Headline Test"

    def test_restore_brand(self, admin, state):
        # restore original so landing page isn't stuck with test brand
        original = dict(state["appearance_draft"])
        admin.put(f"{API}/appearance", json=original)
        admin.post(f"{API}/appearance/publish")


# ---------- Packages & Enrollment ----------
class TestPackages:
    def test_create_package(self, admin, state):
        r = admin.post(f"{API}/packages", json={
            "name": f"TEST_Paket_{RUN}", "description": "Paket testing",
            "duration_weeks": 4, "checkin_frequency": "weekly",
            "price_idr": 1000000, "features": ["A", "B"], "capacity": 10, "active": True})
        assert r.status_code == 200, r.text
        state["package"] = r.json()

    def test_list_packages(self, admin, state):
        r = admin.get(f"{API}/packages")
        assert r.status_code == 200
        ids = [p["package_id"] for p in r.json()]
        assert state["package"]["package_id"] in ids

    def test_enroll_client(self, admin, state):
        r = admin.post(f"{API}/admin/enrollments", json={
            "client_id": state["client"]["user_id"],
            "package_id": state["package"]["package_id"]})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "active"


# ---------- Client onboarding ----------
class TestOnboarding:
    def test_client_login(self, state):
        s = requests.Session()
        _login(s, CLIENT_EMAIL, CLIENT_PASSWORD)
        state["client_sess"] = s

    def test_onboarding_incomplete_rejects(self, state):
        r = state["client_sess"].post(f"{API}/onboarding/complete", json={
            "data": {"full_name": "X"}, "consent": True})
        assert r.status_code == 400

    def test_onboarding_save_and_complete(self, state):
        data = {
            "full_name": "Test Client", "birth_date": "1995-01-01", "gender": "male",
            "height_cm": 175, "weight_kg": 75, "goal": "fat_loss",
            "activity_level": "moderate", "training_days": 4,
            "equipment": ["barbell", "dumbbell"], "meals_per_day": 4,
            "parq_answered": True, "parq_flags": False}
        r = state["client_sess"].put(f"{API}/onboarding", json={"data": data})
        assert r.status_code == 200
        assert r.json()["completeness"] == 100

        r = state["client_sess"].post(f"{API}/onboarding/complete",
                                      json={"data": data, "consent": True})
        assert r.status_code == 200, r.text

        r = state["client_sess"].get(f"{API}/auth/me")
        assert r.json()["onboarding_complete"] is True

    def test_consent_required(self, state):
        # Cannot re-complete without consent
        r = state["client_sess"].post(f"{API}/onboarding/complete",
                                      json={"data": {}, "consent": False})
        assert r.status_code == 400


# ---------- Coach: plans ----------
class TestPlans:
    def test_coach_login_and_sees_client(self, state):
        s = requests.Session()
        _login(s, COACH_EMAIL, COACH_PASSWORD)
        state["coach_sess"] = s
        r = s.get(f"{API}/coach/clients")
        assert r.status_code == 200
        clients = r.json()
        assert any(c["client"]["user_id"] == state["client"]["user_id"] for c in clients)

    def test_client_overview_by_coach(self, state):
        r = state["coach_sess"].get(f"{API}/clients/{state['client']['user_id']}/overview")
        assert r.status_code == 200

    def test_nutrition_plan_publish_409_then_confirm(self, state):
        # Create plan with mismatched macros to trigger 409
        r = state["coach_sess"].post(f"{API}/plans/nutrition", json={
            "client_id": state["client"]["user_id"],
            "name": "Nutrisi v1",
            "content": {"targets": {"calories": 2500, "protein": 180, "carbs": 250, "fat": 70},
                        "meals": [{"name": "Sarapan", "foods": []}]},
        })
        assert r.status_code == 200, r.text
        plan_id = r.json()["plan_id"]
        state["nutrition_plan_id"] = plan_id

        # macros: 180*4+250*4+70*9 = 720+1000+630 = 2350 vs 2500 => 6% => no 409
        # Adjust targets to force >10%
        adj = {"calories": 3000, "protein": 100, "carbs": 100, "fat": 30}
        r = state["coach_sess"].put(f"{API}/plans/nutrition/{plan_id}",
                                    json={"content": {"targets": adj, "meals": []}})
        assert r.status_code == 200

        r = state["coach_sess"].post(f"{API}/plans/nutrition/{plan_id}/publish", json={})
        assert r.status_code == 409, f"expected 409 got {r.status_code}: {r.text}"

        r = state["coach_sess"].post(f"{API}/plans/nutrition/{plan_id}/publish",
                                     json={"confirm": True})
        assert r.status_code == 200, r.text

    def test_training_plan_create_and_publish(self, state):
        r = state["coach_sess"].post(f"{API}/plans/training", json={
            "client_id": state["client"]["user_id"],
            "name": "Training v1",
            "content": {"days": [
                {"day_label": "Day 1 - Push",
                 "exercises": [{"name": "Barbell Bench Press", "sets": 4, "reps": "6-8", "rir": 2},
                               {"name": "Overhead Press", "sets": 3, "reps": "8-10", "rir": 2}]},
                {"day_label": "Day 2 - Pull",
                 "exercises": [{"name": "Barbell Row", "sets": 4, "reps": "6-8", "rir": 2}]}
            ]},
        })
        assert r.status_code == 200, r.text
        plan_id = r.json()["plan_id"]
        state["training_plan_id"] = plan_id

        r = state["coach_sess"].post(f"{API}/plans/training/{plan_id}/publish", json={})
        assert r.status_code == 200, r.text

    def test_client_sees_active_plans(self, state):
        r = state["client_sess"].get(f"{API}/plans/nutrition")
        assert r.status_code == 200
        active = [p for p in r.json() if p["status"] == "active"]
        assert len(active) >= 1

        r = state["client_sess"].get(f"{API}/plans/training")
        assert r.status_code == 200
        active = [p for p in r.json() if p["status"] == "active"]
        assert len(active) >= 1


# ---------- Client logs ----------
class TestLogs:
    def test_weight_log(self, state):
        r = state["client_sess"].post(f"{API}/logs/weight", json={"weight": 75.2})
        assert r.status_code == 200
        r = state["client_sess"].get(f"{API}/logs/weight")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_foods_listing(self, state):
        r = state["client_sess"].get(f"{API}/foods")
        assert r.status_code == 200
        foods = r.json()
        assert len(foods) >= 20  # seeded 26
        state["food"] = foods[0]

    def test_meal_log(self, state):
        food = state["food"]
        r = state["client_sess"].post(f"{API}/logs/meal", json={
            "name": "Sarapan",
            "items": [{"food_id": food["food_id"], "name": food["name"], "qty": 200}],
            "calories": food["calories"] * 2, "protein": food["protein"] * 2,
            "carbs": food["carbs"] * 2, "fat": food["fat"] * 2})
        assert r.status_code == 200

    def test_daily_log(self, state):
        r = state["client_sess"].post(f"{API}/logs/daily",
                                      json={"water_ml": 2500, "steps": 8000})
        assert r.status_code == 200

    def test_workout_log(self, state):
        r = state["client_sess"].post(f"{API}/logs/workout", json={
            "plan_id": state.get("training_plan_id", ""),
            "day_label": "Day 1 - Push", "duration_min": 60, "difficulty": 7,
            "exercises": [{"name": "Bench Press", "sets": [{"load": 60, "reps": 8}]}]})
        assert r.status_code == 200

    def test_progress_endpoint(self, state):
        r = state["client_sess"].get(f"{API}/clients/{state['client']['user_id']}/progress")
        assert r.status_code == 200
        d = r.json()
        assert "weight_series" in d and len(d["weight_series"]) >= 1


# ---------- Check-ins ----------
class TestCheckins:
    def test_coach_opens_checkin(self, state):
        r = state["coach_sess"].post(f"{API}/checkins/open",
                                     json={"client_id": state["client"]["user_id"]})
        assert r.status_code == 200
        state["checkin_id"] = r.json()["checkin_id"]

    def test_client_submits(self, state):
        r = state["client_sess"].put(f"{API}/checkins/{state['checkin_id']}", json={
            "data": {"mood": "baik", "energy": 7, "adherence": "90%"},
            "photos": []})
        assert r.status_code == 200

    def test_coach_responds(self, state):
        r = state["coach_sess"].post(f"{API}/checkins/{state['checkin_id']}/respond", json={
            "text": "Bagus, lanjutkan.", "adjustments": "Tambah 5% karb",
            "next_focus": "Sleep 7h+"})
        assert r.status_code == 200

    def test_client_sees_response(self, state):
        r = state["client_sess"].get(f"{API}/checkins/{state['checkin_id']}")
        assert r.status_code == 200
        assert r.json()["status"] == "responded"
        assert r.json()["coach_response"]["text"] == "Bagus, lanjutkan."


# ---------- Messages ----------
class TestMessages:
    def test_client_sends(self, state):
        r = state["client_sess"].post(f"{API}/messages", json={
            "to_id": state["coach"]["user_id"], "text": "Halo coach"})
        assert r.status_code == 200

    def test_coach_reads_and_replies(self, state):
        r = state["coach_sess"].get(f"{API}/messages/{state['client']['user_id']}")
        assert r.status_code == 200
        assert any(m["text"] == "Halo coach" for m in r.json())

        r = state["coach_sess"].post(f"{API}/messages", json={
            "to_id": state["client"]["user_id"], "text": "Halo, siap bantu"})
        assert r.status_code == 200

    def test_coach_threads(self, state):
        r = state["coach_sess"].get(f"{API}/messages/threads")
        assert r.status_code == 200
        assert any(t["partner"]["user_id"] == state["client"]["user_id"] for t in r.json())


# ---------- Enhanced ----------
class TestEnhanced:
    def test_client_self_report(self, state):
        r = state["client_sess"].post(f"{API}/enhanced", json={
            "entries": [{"substance": "creatine", "dose": "5g", "time": "am"}],
            "notes": "self report"})
        assert r.status_code == 200
        assert r.json()["provenance"] == "self_report"

    def test_coach_sees_enhanced(self, state):
        r = state["coach_sess"].get(f"{API}/enhanced",
                                    params={"client_id": state["client"]["user_id"]})
        assert r.status_code == 200
        assert len(r.json()) >= 1
        assert r.json()[0]["provenance"] == "self_report"


# ---------- Payments ----------
class TestPayments:
    def test_client_upload_proof(self, state):
        r = state["client_sess"].post(f"{API}/payments/proof", json={
            "package_id": state["package"]["package_id"],
            "package_name": state["package"]["name"],
            "file_url": "/api/uploads/dummy.png", "note": "TF BCA"})
        assert r.status_code == 200
        state["proof_id"] = r.json()["proof_id"]

    def test_admin_verify(self, admin, state):
        r = admin.patch(f"{API}/admin/payments/{state['proof_id']}",
                        json={"status": "verified"})
        assert r.status_code == 200

        r = admin.get(f"{API}/admin/payments")
        assert r.status_code == 200
        rec = next((p for p in r.json() if p["proof_id"] == state["proof_id"]), None)
        assert rec and rec["status"] == "verified"


# ---------- RBAC negatives ----------
class TestRBAC:
    def test_client_cannot_admin_stats(self, state):
        r = state["client_sess"].get(f"{API}/admin/stats")
        assert r.status_code == 403

    def test_coach_cannot_admin_stats(self, state):
        r = state["coach_sess"].get(f"{API}/admin/stats")
        assert r.status_code == 403

    def test_coach_cannot_access_unassigned_client(self, admin, state):
        # Create an unassigned client
        email = f"unassigned_{RUN}@test.com"
        r = admin.post(f"{API}/admin/users", json={
            "name": "Unassigned", "email": email,
            "password": "Passw0rd12", "role": "client"})
        assert r.status_code == 200
        other_id = r.json()["user_id"]
        r = state["coach_sess"].get(f"{API}/clients/{other_id}/overview")
        assert r.status_code == 403

    def test_google_session_invalid(self):
        r = requests.post(f"{API}/auth/google-session", json={"session_id": "invalid_" + RUN})
        assert r.status_code == 401
