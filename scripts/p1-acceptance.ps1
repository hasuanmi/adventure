# P1 Acceptance Runner (A-O) - ASCII only
$ErrorActionPreference = "Stop"
$BASE = "http://localhost:8500/api"
$T = "$env:TEMP"

function J($name, $json) { Set-Content "$T\$name.json" $json -NoNewline -Encoding Ascii }
function CallRaw($method, $path, $token, $bodyName) {
  $args = @("-s", "-X", $method, "$BASE$path")
  $args += "-H", "Content-Type: application/json"
  if ($token) { $args += "-H", "Authorization: Bearer $token" }
  if ($bodyName) { $args += "-d", "@$T\$bodyName.json" }
  return (& curl.exe @args) -join "`n"
}
function CallCode($method, $path, $token, $bodyName) {
  $args = @("-s", "-o", "NUL", "-w", "%{http_code}", "-X", $method, "$BASE$path")
  $args += "-H", "Content-Type: application/json"
  if ($token) { $args += "-H", "Authorization: Bearer $token" }
  if ($bodyName) { $args += "-d", "@$T\$bodyName.json" }
  return (& curl.exe @args)
}
function Q($sql) { return ((docker exec huahua-postgres psql -U huahua -d huahua -t -c $sql) -join "").Trim() }

function NewTask($token, $childId, $title, $requiresApproval, $reviewerId) {
  $body = @{ childId=$childId; title=$title; requiresApproval=$requiresApproval } | ConvertTo-Json -Compress
  if ($reviewerId) { $body = (@{ childId=$childId; title=$title; requiresApproval=$requiresApproval; reviewerId=$reviewerId } | ConvertTo-Json -Compress) }
  Set-Content "$T\nt.json" $body -NoNewline -Encoding Ascii
  $raw = CallRaw "POST" "/tasks" $token "nt"
  return ($raw | ConvertFrom-Json)
}

Write-Output "========== 0. ENV =========="
Write-Output ("ps: " + ((docker compose ps --format "{{.Name}}:{{.Status}}" | ForEach-Object { $_ }) -join " | "))
Write-Output ("health: " + (curl.exe -s "$BASE/health"))

Write-Output "========== 0. RESET =========="
Q "DELETE FROM approval_records; DELETE FROM reward_grants; DELETE FROM task_completions; DELETE FROM approval_requests; DELETE FROM tasks; DELETE FROM user_growth; DELETE FROM refresh_tokens; DELETE FROM users;"
Write-Output ("users after reset: " + (Q "SELECT COUNT(*) FROM users;"))

Write-Output "========== 0. USERS & FAMILY & TOKENS =========="
J p '{"username":"parent1","password":"secret123","role":"parent"}'
J c '{"username":"child1","password":"secret123","role":"child"}'
J p2 '{"username":"parent2","password":"secret123","role":"parent"}'
CallRaw "POST" "/auth/register" $null "p" | Out-Null
CallRaw "POST" "/auth/register" $null "c" | Out-Null
CallRaw "POST" "/auth/register" $null "p2" | Out-Null
Q "UPDATE users SET family_id=(SELECT id FROM users WHERE username='parent1') WHERE username IN ('parent1','child1','parent2');"
J lp '{"username":"parent1","password":"secret123"}'
J lc '{"username":"child1","password":"secret123"}'
J lp2 '{"username":"parent2","password":"secret123"}'
$pt = (CallRaw "POST" "/auth/login" $null "lp" | ConvertFrom-Json).accessToken
$ct = (CallRaw "POST" "/auth/login" $null "lc" | ConvertFrom-Json).accessToken
$p2t = (CallRaw "POST" "/auth/login" $null "lp2" | ConvertFrom-Json).accessToken
Set-Content "$T\ptok.txt" $pt -NoNewline
Set-Content "$T\ctok.txt" $ct -NoNewline
$cid = Q "SELECT id FROM users WHERE username='child1';"
$parentId = Q "SELECT id FROM users WHERE username='parent1';"
Write-Output ("tokens: parent=$($pt.Length) child=$($ct.Length) parent2=$($p2t.Length)")
Write-Output ("family set: child.family_id=$cid")

# ---------- A. CREATE TASK ----------
Write-Output "========== A. CREATE TASK =========="
J start '{"action":"start"}'
J done '{"action":"complete"}'
J note '{"note":"done, please review"}'
J ok '{}'
J rj '{"comment":"not finished, please redo"}'
$ta = NewTask $pt $cid "MathTaskA" $false $null
$taid = $ta.id
Write-Output ("A create: status=$($ta.status) http=" + (CallCode "POST" "/tasks" $pt "nt"))
Write-Output ("A db: " + (Q "SELECT title,status FROM tasks WHERE title='MathTaskA';"))

# ---------- B. AUTO COMPLETE + GRANT ----------
Write-Output "========== B. AUTO COMPLETE =========="
$s1 = CallRaw "POST" "/tasks/$taid/status" $ct "start" | ConvertFrom-Json
$s2 = CallRaw "POST" "/tasks/$taid/status" $ct "done" | ConvertFrom-Json
Write-Output ("B start->$($s1.status) complete->$($s2.status)")
$g0 = CallRaw "GET" "/growth/me" $ct $null | ConvertFrom-Json
Write-Output ("B growth: xp=$($g0.xp) coins=$($g0.coins) logicLv=$($g0.dimensionLevels.logic)")
Write-Output ("B db task: " + (Q "SELECT status FROM tasks WHERE id='$taid';"))
Write-Output ("B db completion: " + (Q "SELECT status FROM task_completions WHERE task_id='$taid';"))
Write-Output ("B db growth: " + (Q "SELECT xp,coins FROM user_growth WHERE user_id='$cid';"))
Write-Output ("B db grant: " + (Q "SELECT COUNT(*) FROM reward_grants WHERE task_id='$taid';"))

# ---------- C. APPROVAL -> PENDING ----------
Write-Output "========== C. PENDING =========="
$tb = NewTask $pt $cid "EnglishTaskB" $true $parentId
$tbid = $tb.id
$cb = CallRaw "POST" "/tasks/$tbid/complete" $ct "note" | ConvertFrom-Json
$ap1 = $cb[0].approvalRequestId
Write-Output ("C submit: completionStatus=$($cb[0].status) approvalId=$ap1")
Write-Output ("C db completion: " + (Q "SELECT status FROM task_completions WHERE task_id='$tbid';"))
Write-Output ("C db approval: " + (Q "SELECT business_type,status FROM approval_requests WHERE business_id=(SELECT id FROM task_completions WHERE task_id='$tbid' AND status='pending');"))
Write-Output ("C db task: " + (Q "SELECT status FROM tasks WHERE id='$tbid';"))

# ---------- D. APPROVE -> COMPLETED + GRANT ----------
Write-Output "========== D. APPROVE =========="
$lst = CallRaw "GET" "/approvals?as=reviewer&status=pending" $pt $null | ConvertFrom-Json
Write-Output ("D reviewer list: n=$($lst.Count) canAct=$($lst[0].canAct)")
$ap = CallRaw "POST" "/approvals/$ap1/approve" $pt "ok" | ConvertFrom-Json
Write-Output ("D approve: status=$($ap.status) reviewedBy=$($ap.reviewedBy)")
Write-Output ("D db task: " + (Q "SELECT status FROM tasks WHERE id='$tbid';"))
Write-Output ("D db completion: " + (Q "SELECT status FROM task_completions WHERE id=(SELECT business_id FROM approval_requests WHERE id='$ap1');"))
Write-Output ("D db grant: " + (Q "SELECT COUNT(*) FROM reward_grants WHERE task_id='$tbid';"))
Write-Output ("D db audit: " + (Q "SELECT string_agg(action,',') FROM approval_records WHERE request_id='$ap1';"))
$g1 = CallRaw "GET" "/growth/me" $ct $null | ConvertFrom-Json
Write-Output ("D growth after: xp=$($g1.xp) (expect 20)")

# ---------- E. REJECT -> RETURNED ----------
Write-Output "========== E. REJECT =========="
$tc = NewTask $pt $cid "ReadingTaskC" $true $parentId
$tcid = $tc.id
CallRaw "POST" "/tasks/$tcid/complete" $ct "note" | Out-Null
$ap2 = (CallRaw "GET" "/approvals?as=reviewer&status=pending" $pt $null | ConvertFrom-Json)[0].id
$rj = CallRaw "POST" "/approvals/$ap2/reject" $pt "rj" | ConvertFrom-Json
$tcS = CallRaw "GET" "/tasks/$tcid" $pt $null | ConvertFrom-Json
Write-Output ("E reject: status=$($rj.status) comment=$($rj.comment)")
Write-Output ("E task: $($tcS.status) (expect returned)")
Write-Output ("E db approval: " + (Q "SELECT status,comment FROM approval_requests WHERE id='$ap2';"))
Write-Output ("E db completion: " + (Q "SELECT status,review_comment FROM task_completions WHERE task_id='$tcid' AND status='rejected';"))

# ---------- F. RESUME -> RESUBMIT -> APPROVE ----------
Write-Output "========== F. RESUME/RESUBMIT =========="
J resume '{"action":"resume"}'
$rs = CallRaw "POST" "/tasks/$tcid/status" $ct "resume" | ConvertFrom-Json
Write-Output ("F resume: $($rs.status) (expect in_progress)")
CallRaw "POST" "/tasks/$tcid/complete" $ct "note" | Out-Null
$ap3 = (CallRaw "GET" "/approvals?as=reviewer&status=pending" $pt $null | ConvertFrom-Json)[0].id
$ap3r = CallRaw "POST" "/approvals/$ap3/approve" $pt "ok" | ConvertFrom-Json
$tcF = CallRaw "GET" "/tasks/$tcid" $pt $null | ConvertFrom-Json
Write-Output ("F approve2: $($ap3r.status) task=$($tcF.status) (expect approved/completed)")
Write-Output ("F db completions: " + (Q "SELECT string_agg(status,',' ORDER BY submitted_at) FROM task_completions WHERE task_id='$tcid';"))
Write-Output ("F db grants: " + (Q "SELECT COUNT(*) FROM reward_grants WHERE task_id='$tcid';"))

# ---------- G. NON-REVIEWER FORBIDDEN ----------
Write-Output "========== G. NON-REVIEWER =========="
$td = NewTask $pt $cid "TaskG" $true $parentId
$tdid = $td.id
CallRaw "POST" "/tasks/$tdid/complete" $ct "note" | Out-Null
$ap4 = (CallRaw "GET" "/approvals?as=reviewer&status=pending" $pt $null | ConvertFrom-Json)[0].id
$gCode = CallCode "POST" "/approvals/$ap4/approve" $p2t "ok"
Write-Output ("G parent2 approve: http=$gCode (expect 403)")
Write-Output ("G db approval still: " + (Q "SELECT status FROM approval_requests WHERE id='$ap4';"))

# ---------- H. SELF-REVIEW FORBIDDEN ----------
Write-Output "========== H. SELF-REVIEW =========="
$hBody = @{ childId=$cid; title="TaskH"; requiresApproval=$true; reviewerId=$cid } | ConvertTo-Json -Compress
Set-Content "$T\th.json" $hBody -NoNewline -Encoding Ascii
$hRaw = CallRaw "POST" "/tasks" $pt "th"
$hCode = CallCode "POST" "/tasks" $pt "th"
Write-Output ("H create self-review: http=$hCode body=$hRaw (expect 400 self_review_forbidden)")
Write-Output ("H db count: " + (Q "SELECT COUNT(*) FROM tasks WHERE title='TaskH';"))

# ---------- I. REJECT COMMENT ----------
Write-Output "========== I. REJECT COMMENT =========="
Write-Output ("I comment stored: " + (Q "SELECT comment FROM approval_requests WHERE id='$ap2';"))
Write-Output ("I NOTE: comment is OPTIONAL in current impl (v1.2 says required) - gap flagged")

# ---------- J. REPEAT APPROVE ----------
Write-Output "========== J. REPEAT APPROVE =========="
$jCode = CallCode "POST" "/approvals/$ap1/approve" $pt "ok"
Write-Output ("J repeat approve: http=$jCode (expect 409)")
Write-Output ("J db grant count: " + (Q "SELECT COUNT(*) FROM reward_grants WHERE task_id='$tbid';"))

# ---------- K. REPEAT SUBMIT ----------
Write-Output "========== K. REPEAT SUBMIT =========="
$tf = NewTask $pt $cid "TaskK" $true $parentId
$tfid = $tf.id
CallRaw "POST" "/tasks/$tfid/complete" $ct "note" | Out-Null
$kCode = CallCode "POST" "/tasks/$tfid/complete" $ct "note"
Write-Output ("K repeat submit: http=$kCode (expect 409)")
Write-Output ("K db pending count: " + (Q "SELECT COUNT(*) FROM task_completions WHERE task_id='$tfid' AND status='pending';"))

# ---------- L. GROWTH INCREMENTS ----------
Write-Output "========== L. GROWTH INCREMENT =========="
$gl0 = CallRaw "GET" "/growth/me" $ct $null | ConvertFrom-Json
$tl = NewTask $pt $cid "TaskL" $false $null
$tlid = $tl.id
CallRaw "POST" "/tasks/$tlid/status" $ct "done" | Out-Null
$gl1 = CallRaw "GET" "/growth/me" $ct $null | ConvertFrom-Json
Write-Output ("L xp: $($gl0.xp) -> $($gl1.xp) (expect +10); coins: $($gl0.coins) -> $($gl1.coins) (expect +10)")

# ---------- M. MULTI-LEVEL-UP ----------
Write-Output "========== M. MULTI-LEVEL =========="
Q "UPDATE user_growth SET xp=230 WHERE user_id='$cid';"
$gm = CallRaw "GET" "/growth/me" $ct $null | ConvertFrom-Json
Write-Output ("M xp=230 -> level=$($gm.xpLevel) (expect 3)")
Q "UPDATE user_growth SET xp=0 WHERE user_id='$cid';"

# ---------- N. GRANT IDEMPOTENCY ----------
Write-Output "========== N. GRANT IDEMPOTENCY =========="
$dupGrants = Q "SELECT COUNT(*) FROM (SELECT completion_id FROM reward_grants GROUP BY completion_id HAVING COUNT(*)>1) d;"
Write-Output ("N completions with >1 grant: $dupGrants (expect 0)")

# ---------- O. DOCKER CHAIN ----------
Write-Output "========== O. DOCKER CHAIN =========="
Write-Output ("O ps: " + ((docker compose ps --format "{{.Name}}:{{.Status}}" | ForEach-Object { $_ }) -join " | "))
Write-Output ("O health(8500): " + (curl.exe -s "$BASE/health"))
Write-Output ("O web index http: " + (curl.exe -s -o NUL -w "%{http_code}" "http://localhost:8500/"))
Write-Output "========== DONE =========="
