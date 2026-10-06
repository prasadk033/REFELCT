============================================================
REFLECT — PERMANENT ANTIGRAVITY SAFETY & CHANGE CONTROL POLICY
============================================================

PROJECT: REFLECT
ENVIRONMENT: Production / Client-facing application

IMPORTANT:
This is a production application containing real client/project data.

The highest priority is:

1. Protect production data.
2. Protect project ownership and tenant isolation.
3. Never make unrequested database changes.
4. Never modify unrelated code.
5. Never create test data/files/scripts unless explicitly requested.
6. Never "fix" something by changing production data.
7. Always diagnose before modifying.
8. Make the smallest possible change.
9. Ask for explicit approval whenever a protected resource would be modified.

============================================================
1. GOLDEN RULE
============================================================

DEFAULT MODE = READ-ONLY DIAGNOSIS.

You are NOT authorized to modify production data unless the user explicitly tells you to modify that specific data.

If a task can be completed without touching the database, DO NOT touch the database.

If a task requires a database change, STOP and ask for explicit approval.

NEVER assume that database modification is acceptable just because it appears to solve the problem.

NEVER perform a database mutation as a "fix" automatically.

============================================================
2. PRODUCTION DATABASE IS READ-ONLY BY DEFAULT
============================================================

The production PostgreSQL database must be treated as READ-ONLY.

Allowed without explicit approval:

- SELECT
- \dt
- \d
- \l
- EXPLAIN
- schema inspection
- indexes inspection
- foreign-key inspection
- read-only diagnostics
- checking row counts
- checking ownership
- checking configuration metadata

Forbidden without explicit user approval:

- INSERT
- UPDATE
- DELETE
- TRUNCATE
- DROP
- ALTER
- CREATE
- GRANT
- REVOKE
- database migrations that modify production
- bulk data synchronization
- bulk ownership reassignment
- data cleanup
- data repair
- data backfill
- data normalization
- changing production records

This applies even if the operation appears harmless.

============================================================
3. PROJECT OWNERSHIP IS PROTECTED
============================================================

The following fields are HIGHLY PROTECTED:

projects.user_id

and any equivalent ownership/tenant fields.

NEVER change:

projects.user_id

automatically.

NEVER reassign projects between users.

NEVER consolidate projects under one user.

NEVER "sync" project ownership.

NEVER assign all projects to one account.

NEVER use an email address to automatically determine ownership.

NEVER run a command such as:

UPDATE projects SET user_id = ...

unless the user explicitly requested that exact ownership change.

Even if a user appears to have zero projects, DO NOT automatically change project ownership.

First diagnose:

- authenticated user
- user ID
- project owner ID
- authorization logic
- database records
- frontend project query
- backend project query

Only after diagnosis may a human explicitly authorize a data correction.

============================================================
4. NEVER USE BULK OWNERSHIP UPDATES
============================================================

NEVER execute:

UPDATE projects SET user_id = ...

NEVER execute:

UPDATE projects
SET user_id = ...
WHERE ...

unless the user has explicitly authorized the exact operation.

Even with approval, prefer:

- exact project ID
- exact user ID
- explicit confirmation
- backup before mutation
- post-change verification

Never use broad conditions such as:

WHERE name ILIKE '%something%'

when project identity can be determined by ID.

============================================================
5. PROJECT CREATION OWNERSHIP RULE
============================================================

Normal REFLECT project creation MUST derive ownership from the authenticated backend user.

Correct conceptual behavior:

authenticated JWT
        ↓
current_user
        ↓
current_user.id
        ↓
project.user_id

The frontend must NOT be trusted to determine project ownership.

Do NOT implement:

project.user_id = request.user_id

when request.user_id comes from the client.

The backend must use:

project.user_id = current_user.id

or the equivalent authoritative authenticated identity.

A normal client must never be able to create a project owned by another user.

============================================================
6. TENANT ISOLATION IS NON-NEGOTIABLE
============================================================

REFLECT is a multi-user/client application.

Every project belongs to an authenticated user/tenant.

User A must only be able to access User A's projects.

User B must only be able to access User B's projects.

Never weaken this isolation for debugging.

Never bypass:

Project.user_id == current_user.id

Never remove authorization checks to make testing easier.

Never use an administrator/consolidation account as a workaround for missing projects.

If a user cannot see a project:

DO NOT change ownership.

Investigate the authorization/query/data issue first.

============================================================
7. AI MUST NEVER CONTROL OWNERSHIP
============================================================

AI/LLM functionality must NEVER modify:

- project owner
- user ID
- tenant ID
- authentication records
- authorization records
- client identity

AI may process project information.

AI may generate:

- Brief Cards
- Program Items
- AI Questions
- summaries
- interpretations
- structured project information

AI must NOT decide who owns the project.

AI must NOT execute arbitrary database mutations.

============================================================
8. AUTHENTICATION / OAUTH PROTECTION
============================================================

Authentication is a protected subsystem.

Do not modify:

- Google OAuth configuration
- JWT logic
- authentication middleware
- user records
- OAuth redirect configuration
- session handling

unless the user explicitly asks for an authentication change.

If authentication fails:

FIRST diagnose.

Do not immediately modify authentication code.

Trace:

Browser
→ Frontend
→ Nginx
→ Backend
→ OAuth provider
→ Callback
→ JWT/session

Only modify the smallest required component after the root cause is confirmed.

============================================================
9. DATABASE DIAGNOSTIC POLICY
============================================================

When investigating a database-related problem:

FIRST perform read-only inspection.

Example allowed:

SELECT
FROM projects
JOIN users
...

Then report:

- what was found
- affected records
- probable root cause
- proposed correction

DO NOT execute the correction automatically.

Use this exact behavior:

DIAGNOSE
   ↓
REPORT
   ↓
WAIT FOR USER APPROVAL
   ↓
CHANGE ONLY IF APPROVED
   ↓
VERIFY

Never:

DIAGNOSE
   ↓
AUTOMATICALLY MODIFY DATABASE

============================================================
10. NEVER CREATE TEST DATA IN PRODUCTION
============================================================

Do not create:

- test users
- test projects
- fake Brief Cards
- fake Program Items
- fake documents
- temporary database records

inside production.

Do not create test files that connect to production databases.

If testing is necessary, use:

- development database
- test database
- isolated environment
- mock data

If an isolated environment does not exist, report that fact.

Do not create one by modifying production.

============================================================
11. NEVER CREATE RANDOM TEST FILES
============================================================

Do not create:

- temporary Python scripts
- test SQL files
- debugging scripts
- scratch files
- temporary migration files
- random test components
- duplicate implementations

unless explicitly requested.

If a temporary diagnostic command is sufficient, use the command without creating a file.

If a file is genuinely required:

STOP and ask for approval.

============================================================
12. DO NOT MODIFY UNRELATED FILES
============================================================

When fixing a problem:

Identify the exact files involved.

Modify ONLY those files.

Do not perform unrelated:

- refactoring
- formatting
- cleanup
- renaming
- dependency upgrades
- architecture changes
- UI redesign
- database changes

Do not use a small task as an opportunity to "improve" unrelated parts of REFLECT.

============================================================
13. NO AUTOMATIC DATABASE MIGRATIONS
============================================================

Never modify production schema automatically.

Do not run:

alembic upgrade
migration scripts
ALTER TABLE
DROP TABLE
CREATE TABLE
schema synchronization

unless explicitly authorized.

If a schema problem is discovered:

REPORT IT.

Do not fix it automatically.

============================================================
14. DO NOT CHANGE DOCKER / INFRASTRUCTURE AUTOMATICALLY
============================================================

Do not modify:

- docker-compose.yml
- Dockerfiles
- nginx
- reverse proxy
- ports
- volumes
- networks
- production environment variables

unless the task specifically requires it.

Do not rebuild production containers simply because a diagnostic problem exists.

Diagnose first.

============================================================
15. DO NOT CHANGE LITELLM / QWEN AUTOMATICALLY
============================================================

AI service problems must be diagnosed before configuration changes.

Do not automatically change:

- Qwen URL
- LiteLLM configuration
- model configuration
- API keys
- timeout
- fallback models
- health checks
- authentication

If the internal health check says:

healthy = true

do not assume Qwen is broken.

Trace the actual request path first.

============================================================
16. GIT SAFETY
============================================================

Before making code changes:

Inspect:

git status --short
git diff --stat
git diff --name-only

Never:

- reset
- checkout
- clean
- revert
- delete uncommitted work

without explicit user approval.

Never overwrite existing user changes.

If unrelated uncommitted changes exist:

STOP.

Report them.

Do not modify those files.

============================================================
17. DIAGNOSE BEFORE FIXING
============================================================

For every bug:

STEP 1:
Reproduce/understand the problem.

STEP 2:
Trace the request/data flow.

STEP 3:
Identify root cause.

STEP 4:
Identify minimum files requiring modification.

STEP 5:
Report proposed change.

STEP 6:
Only implement after authorization if the change touches protected resources.

Never jump directly from:

"Something is broken"

to:

"Modify database/configuration/authentication."

============================================================
18. CHANGE CLASSIFICATION
============================================================

Classify every requested change as:

A. READ-ONLY
B. CODE CHANGE
C. CONFIGURATION CHANGE
D. DATABASE DATA CHANGE
E. DATABASE SCHEMA CHANGE
F. AUTHENTICATION/AUTHORIZATION CHANGE
G. INFRASTRUCTURE CHANGE

A:
Can proceed.

B:
Can proceed only within the requested scope.

C-G:
Require explicit user approval when they affect production.

DATABASE DATA CHANGE and OWNERSHIP CHANGE are ALWAYS protected.

============================================================
19. EXPLICIT APPROVAL REQUIREMENT
============================================================

If you believe a database change is required, do NOT perform it.

Return:

"Database modification is required.
I have not made the change.
The affected table/records are:
...
The proposed operation is:
...
Please explicitly approve this database change."

Do not interpret phrases such as:

"fix it"
"make it work"
"restore it"
"solve this"

as permission to modify production data.

The user must explicitly authorize the database operation.

============================================================
20. IF USER APPROVES A DATABASE CHANGE
============================================================

Even after approval:

1. Identify exact records.
2. Never use broad matching if IDs are available.
3. Take/confirm a backup where appropriate.
4. Show the exact proposed SQL.
5. Confirm the target rows.
6. Apply the smallest possible change.
7. Verify the result.
8. Report exactly what changed.

Never perform unrelated database changes.

============================================================
21. PRODUCTION BACKUP SAFETY
============================================================

Before an approved destructive or ownership-changing operation:

Recommend a backup.

Never assume the backup exists.

Do not delete or overwrite existing backups.

============================================================
22. PROGRAM / BRIEF / REFLECT AI WORKFLOWS
============================================================

AI workflows must operate within the selected project.

They must never modify:

- Project ownership
- User identity
- Tenant identity
- Authentication
- Authorization

Program generation must operate on approved Brief data.

Brief generation must operate on project documents/data.

AI generation must not use project ownership as an AI-generated field.

============================================================
23. ERROR HANDLING
============================================================

If an operation fails:

DO NOT compensate by modifying unrelated database records.

Example:

Bad:

"User cannot see projects"
→ reassign all projects to one user.

Correct:

"User cannot see projects"
→ inspect authentication
→ inspect user ID
→ inspect project ownership
→ inspect authorization
→ inspect query
→ report root cause.

============================================================
24. NO "CONSOLIDATION ACCOUNT" WORKAROUNDS
============================================================

Never create or select a user as a:

- consolidation account
- default project owner
- fallback owner
- temporary owner

unless the user explicitly requests such an architecture.

Never move all projects to:

admin
developer
test account
consolidation account
current logged-in user

as a debugging workaround.

============================================================
25. PRODUCTION CLIENT DATA HAS PRIORITY
============================================================

Real client data is more important than completing a coding task quickly.

If there is uncertainty:

STOP.

Do not guess.

Do not repair data automatically.

Do not run a bulk command.

Ask the user.

============================================================
26. REQUIRED BEHAVIOR BEFORE ANY HIGH-RISK CHANGE
============================================================

Before changing:

DATABASE
AUTH
AUTHORIZATION
OWNERSHIP
DOCKER
NGINX
PRODUCTION CONFIGURATION
OAUTH
USER DATA

you MUST:

1. Explain what you found.
2. Explain why the change is required.
3. Identify exact files/tables/records.
4. Explain potential impact.
5. Wait for explicit approval.

============================================================
27. FINAL PRE-COMMIT CHECK
============================================================

Before completing any task, verify:

[ ] No production database mutation occurred unless explicitly approved.
[ ] No project ownership was changed unless explicitly approved.
[ ] No user ownership was changed.
[ ] No tenant isolation was weakened.
[ ] No authentication was weakened.
[ ] No test data was inserted into production.
[ ] No random test files were created.
[ ] No unrelated files were modified.
[ ] No user changes were overwritten.
[ ] No production configuration was changed unnecessarily.
[ ] No destructive command was executed.
[ ] No bulk UPDATE/DELETE was executed.
[ ] No database migration was executed without approval.

============================================================
28. MANDATORY RESPONSE FORMAT FOR RISKY TASKS
============================================================

If a task involves a protected resource, respond first with:

RISK LEVEL:
LOW / MEDIUM / HIGH / CRITICAL

RESOURCE:
Database / Ownership / Auth / Production Config / etc.

PROPOSED ACTION:
...

IMPACT:
...

CURRENT STATE:
...

APPROVAL REQUIRED:
YES / NO

If approval is required:

DO NOT IMPLEMENT YET.

============================================================
29. ABSOLUTE PROHIBITION
============================================================

NEVER execute a command equivalent to:

UPDATE projects SET user_id = ...

without explicit user authorization.

NEVER execute a command equivalent to:

UPDATE projects
SET user_id = <some user>

as a workaround.

NEVER automatically move all projects to one account.

NEVER automatically "repair" ownership.

NEVER modify production client data to make a test pass.

NEVER assume database mutation is acceptable.

============================================================
30. DEFAULT OPERATING MODE
============================================================

Unless the user explicitly says otherwise:

READ.
ANALYZE.
DIAGNOSE.
REPORT.
WAIT.

Do not modify production data.

Do not modify project ownership.

Do not modify authentication.

Do not create test data.

Do not create unnecessary test files.

Do not touch unrelated code.

The user's explicit instruction controls whether protected production resources may be changed.

============================================================
END OF REFLECT SAFETY POLICY
============================================================
