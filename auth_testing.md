# Auth Testing Playbook (BROGRESSIVE)

## Step 1: MongoDB Verification
```
mongosh --eval "use('test_database'); db.users.find({role:'admin'}).pretty(); db.users.getIndexes()"
```
Verify bcrypt hash starts with `$2b$`, unique index on users.email.

## Step 2: API Testing
```
curl -c /tmp/c.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"tiofansha@gmail.com","password":"Brogressive#2026"}'
curl -b /tmp/c.txt $API/api/auth/me
```

## Step 3: Password Reset
- forgot-password returns identical generic 200 for registered/unregistered emails.
- With FRONTEND_URL loopback the reset link is logged to backend logs; full email send only in preview/prod https.

## Step 4: Google OAuth (Emergent)
- Frontend redirects to https://auth.emergentagent.com/?redirect=<origin>/app
- Callback: URL fragment #session_id=... detected synchronously via useLocation().hash in AppRouter -> AuthCallback -> POST /api/auth/google-session -> cookie session_token (7 days).
- Manual test: insert user + user_sessions doc in mongosh, then call GET /api/auth/me with Authorization: Bearer <session_token>.

## RBAC checks
- Coach can only access assigned clients (assignments collection, active=true).
- Client can only access own data. Admin/super_admin full access.
- Test: coach token hitting /api/clients/<unassigned_id>/overview must return 403.
