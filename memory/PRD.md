# PRD — BROGRESSIVE 1 on 1 Online Coaching

## Problem Statement (ringkasan)
Platform coaching bodybuilding/transformation 1-on-1 production-ready (React + FastAPI + MongoDB, PWA-ready).
Bahasa Indonesia, Asia/Jakarta, metrik, IDR. Brand: BROGRESSIVE (dapat diganti via Admin Appearance).
Referensi konten: Bulletproof Bodies Calorie & Macro Guide, Calorie Deficit Guide, Body Building Diet Book, Evidence Based Training Guide (struktur internal, bukan disalin verbatim).

## Keputusan User
1. Brand: BROGRESSIVE 1 on 1 Online Coaching
2. Auth: JWT custom + Emergent-managed Google login
3. Prioritas MVP: alur inti Definition of Done (admin → invite → onboarding → plans → logs/check-in → feedback + appearance)
4. Enhanced Athlete: HANYA self-report mingguan dari klien yang terlihat coach (provenance: self_report). TIDAK ada cycle builder, dose calculator, stack recommendation, injection tutorial, vendor link, PCT generator, atau AI rekomendasi senyawa — ditiadakan karena panduan PED berbahaya & bertentangan dengan prinsip keamanan prompt sendiri.
5. Pembayaran: manual — info rekening + upload bukti transfer, verifikasi admin.

## Arsitektur
- Backend: /app/backend/server.py (FastAPI monolith ~1458 baris, semua route /api/*, Motor/MongoDB, httpOnly cookie auth: JWT access/refresh + Google session_token, bcrypt, brute-force lockout 5x/15m, rate limit reset password, audit_logs, notifications, StaticFiles /api/uploads maks 8MB)
- Frontend: /app/frontend/src (App.js router + AuthCallback hash session_id, context/AuthContext + BrandContext, components/Layout.jsx dengan sidebar admin/coach & bottom-nav 5 item client, components/ChatThread.jsx)
- Design: /app/design_guidelines.json — dark tactical athletic #0A0A0C, crimson #FF2E00, Barlow Condensed headings, JetBrains Mono metrics
- Test: /app/backend/tests/backend_test.py (45 pytest, semua lulus), /app/auth_testing.md, /app/memory/test_credentials.md

## Personas & Role
- Super Admin/Admin (seed: tiofansha@gmail.com): users, assignment, appearance publish, packages/enrollment, payment verify, audit, stats
- Coach: hanya klien yang di-assign; Client 360° (overview, nutrisi, latihan, check-in, progres, pesan, enhanced, notes privat), plan builder + publish/versioning
- Klien: Easy Mode default (bottom nav), onboarding wizard 7 langkah + PAR-Q + consent, logs, workout execution, check-in wizard, chat, payment proof

## Yang Sudah Diimplementasikan (2026-09-15, MVP lulus 45/45 test)
- Auth lengkap: register/login/logout/me/refresh, forgot/reset password ( Emergent Email Relay, generic response, single-use token 1 jam), Google OAuth Emergent, lockout, token_version invalidation
- RBAC: require_roles + require_client_access (403 untuk cross-tenant/coach tidak ter-assign — teruji)
- Appearance builder: draft/publish/reset, version history (10), live preview desktop/mobile, semua field brand/hero/kontak/sosial/SEO/sections toggle; landing page membaca published
- Admin: dashboard stats, CRUD users + status, assignment dengan history, packages CRUD + enrollment, payment proof verify/reject, audit log
- Onboarding klien: 7 step autosave, completeness score, blok finish <100%, PAR-Q → safety flag + notif coach
- Nutrition builder: target makro + meal plan dari 26 food Indonesia, kalkulator Mifflin-St Jeor (estimasi, override coach), macro consistency check (409 + confirm saat publish), versioning draft/active/completed/archived
- Training builder: days > exercises (sets/reps/rest/tempo/RPE/set_type), duplikasi hari, publish/revisi/arsip, 22 exercise library
- Client: Today (completion ring + next best action + target vs actual), Program (plan aktif + mulai workout), Catat (berat, makan, harian, enhanced self-report), Progres (grafik berat harian + rata-rata 7 hari, 7/30/90 hari), Chat (polling 5s), Check-in wizard 4 langkah + upload 3 foto
- Coach review check-in dengan respons terstruktur; pain flag → safety flag + notif; keyword safety scan pada check-in
- Messaging 1-on-1 coach↔klien, notification center dengan polling + mark-read, notifikasi otomatis (assignment, plan publish, check-in, pesan, payment)

## Backlog Prioritas
### P0 (belum ada, diminta prompt)
- Check-in scheduler otomatis mingguan (saat ini coach buka manual via tombol)
- Export CSV/PDF progres klien
- PWA manifest + service worker + offline draft

### P1
- Template library (plan/training/meal/message snippets), drag-sort sections landing di appearance
- Measurements log (waist/hip/chest...) terpisah dari check-in; photo gallery side-by-side
- Cardio prescription module, habit builder terstruktur, recovery log lengkap
- i18n id/en (saat ini hardcode Indonesia), quiet hours notifikasi, email notifikasi umum (selain reset password)
- Super admin terpisah & manajemen multi-admin penuh

### P2
- Barcode scanner, voice note, ghost overlay foto, watermark, video upload exercise
- Maintenance validation workflow 7–14 hari, refeed/diet break scheduler
- Broadcast announcement admin, retention policy chat

## Known Limitations
- Console 401 dari /api/auth/me saat belum login (kosmetik, expected)
- Foto progres disimpan sebagai file statis /api/uploads (belum object storage)
- Enhanced module terbatas self-report by design (keputusan keamanan)

## Next Tasks
1. Scheduler check-in mingguan otomatis (.emergent/crons.yml)
2. PWA manifest + install prompt
3. Export CSV/ PDF progres
4. Template library coach
