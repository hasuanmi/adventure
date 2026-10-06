# P2 family + approval smoke runner - ASCII only
# Verifies the P2 handover scope end-to-end against a locally running API:
#   1) family create/join/members (no Family table; familyId = parent user id)
#   2) task with requiresApproval -> child submit -> parent approve -> reward granted
#   3) negative cases: non-reviewer cannot approve, reject requires comment,
#      self-review forbidden, no-family user sees no approvals (multi-tenant leak fix)
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/p2-smoke.ps1
#         $env:SMOKE_BASE to override API base (default http://localhost:3000/api)
#         $env:SMOKE_VERBOSE=1 to print raw HTTP bodies
# Notes:  Uses Invoke-WebRequest (not curl.exe) because Windows PowerShell 5.1 strips
#         quotes from inline JSON passed to native commands, and temp body files proved
#         unreliable in that combination.
$ErrorActionPreference = "Continue"
# Invoke-WebRequest uses Write-Progress internally, which can fail on hosts whose
# console buffer is not readable; silence progress for reliability.
$ProgressPreference = "SilentlyContinue"
$BASE = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { "http://localhost:3000/api" }

# DB access (grant-count / cleanup checks). Overridable via PG* env vars so the same
# script runs locally and in CI; when psql is unavailable those checks are SKIPped.
$DBHOST = if ($env:PGHOST) { $env:PGHOST } else { "localhost" }
$DBPORT = if ($env:PGPORT) { $env:PGPORT } else { "5432" }
$DBUSER = if ($env:PGUSER) { $env:PGUSER } else { "huahua" }
$DBNAME = if ($env:PGDATABASE) { $env:PGDATABASE } else { "huahua" }
if (-not $env:PGPASSWORD) { $env:PGPASSWORD = "huahua_dev" }
$PSQL = $env:PSQL
if (-not $PSQL) {
  $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($psqlCmd) { $PSQL = $psqlCmd.Source }
  elseif (Test-Path "C:\Program Files\PostgreSQL\16\bin\psql.exe") { $PSQL = "C:\Program Files\PostgreSQL\16\bin\psql.exe" }
}
$script:hasDb = [bool]$PSQL

$stamp = Get-Random -Minimum 100000 -Maximum 999999
$parent = "qa_p_$stamp"
$child = "qa_c_$stamp"
$lone = "qa_l_$stamp"
$script:fail = 0
$script:pass = 0
$script:skip = 0
$script:Verbose = $env:SMOKE_VERBOSE -eq "1"

function Body($obj) {
  $json = ($obj | ConvertTo-Json -Compress -Depth 5) -join ""
  if ($json.TrimStart() -notmatch '^\{') { throw "Body() produced non-object JSON: $json" }
  return $json
}

# HTTP helper: returns @{ Status = <int>; Text = <string> }; error statuses do not throw
function Http($method, $path, $token, $body) {
  $headers = @{}
  if ($token) { $headers["Authorization"] = "Bearer $token" }
  $params = @{ Method = $method; Uri = "$BASE$path"; Headers = $headers; UseBasicParsing = $true }
  if ($body) { $params["ContentType"] = "application/json"; $params["Body"] = $body }
  if ($script:Verbose) { Write-Host ("  http {0} {1} {2}" -f $method, $path, $(if ($body) { $body } else { "" })) }
  try {
    $resp = Invoke-WebRequest @params
    return [pscustomobject]@{ Status = [int]$resp.StatusCode; Text = [string]$resp.Content }
  } catch {
    # 错误响应体取值必须同时兼容 Windows PowerShell 5.1 与 PowerShell 7：
    #   PS 5.1: Exception.Response 是 HttpWebResponse（有 GetResponseStream）
    #   PS 7   : Exception.Response 是 HttpResponseMessage（无 GetResponseStream），body 在 ErrorDetails.Message
    $resp = $_.Exception.Response
    $status = 0
    $text = ""
    if ($resp) { $status = [int]$resp.StatusCode }
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $text = [string]$_.ErrorDetails.Message }
    if ((-not $text) -and $resp -and ($resp.PSObject.Methods.Name -contains 'GetResponseStream')) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $text = $reader.ReadToEnd()
      $reader.Dispose()
    }
    if (-not $resp) { $text = $_.Exception.Message }
    return [pscustomobject]@{ Status = $status; Text = $text }
  }
}

function Call($method, $path, $token, $body) { return (Http $method $path $token $body).Text }
function Code($method, $path, $token, $body) { return (Http $method $path $token $body).Status }
function J($text) { return ($text | ConvertFrom-Json) }

function Check($name, $actual, $expected) {
  if ("$actual" -eq "$expected") {
    $script:pass++
    Write-Output ("PASS  {0}  (got {1})" -f $name, $actual)
  } else {
    $script:fail++
    Write-Output ("FAIL  {0}  expected={1} got={2}" -f $name, $expected, $actual)
  }
}

function CheckDb($name, $actual, $expected) {
  if (-not $script:hasDb) {
    $script:skip++
    Write-Output ("SKIP  {0}  (psql not available; DB checks skipped)" -f $name)
    return
  }
  Check $name $actual $expected
}

function Q($sql) {
  if (-not $script:hasDb) { return "" }
  try {
    $out = & $PSQL -h $DBHOST -p $DBPORT -U $DBUSER -d $DBNAME -t -A -c $sql 2>&1
    return (($out | Where-Object { "$_" -notmatch '^psql:' }) -join "").Trim()
  } catch {
    return ""
  }
}

Write-Output "=== P2 SMOKE ($stamp) base=$BASE db=$($script:hasDb) ==="

# ---------- 0. register / login ----------
$created = 0
foreach ($spec in @(
    @{ username = $parent; role = "parent" },
    @{ username = $child; role = "child" },
    @{ username = $lone; role = "parent" }
  )) {
  $res = Http "POST" "/auth/register" $null (Body @{ username = $spec.username; password = "secret123"; role = $spec.role })
  if ($res.Status -eq 201 -and $res.Text.Contains('"user"')) { $created++ } else { Write-Output ("  register {0} -> {1} {2}" -f $spec.username, $res.Status, $res.Text) }
}
Check "register 3 users" $created 3

$pt = (J (Call "POST" "/auth/login" $null (Body @{ username = $parent; password = "secret123" }))).accessToken
$ct = (J (Call "POST" "/auth/login" $null (Body @{ username = $child; password = "secret123" }))).accessToken
$lt = (J (Call "POST" "/auth/login" $null (Body @{ username = $lone; password = "secret123" }))).accessToken
Check "login parent/child/lone" ((($pt.Length -gt 20) -and ($ct.Length -gt 20)) -and ($lt.Length -gt 20)) "True"

# ---------- 1. family: create / join / me ----------
$meRaw = Call "GET" "/auth/me" $pt $null
Check "fresh parent has no family" ((J $meRaw).user.familyId) ""
$famRaw = Call "POST" "/family/create" $pt $null
if ($script:Verbose) { Write-Host ("  raw[family/create] " + $famRaw) }
$famCreate = J $famRaw
Check "POST /family/create" ($famCreate.familyId -ne $null) "True"
Check "inviteCode == parent username" $famCreate.inviteCode $parent
Check "duplicate create -> 409" (Code "POST" "/family/create" $pt $null) "409"
$joinRaw = Call "POST" "/family/join" $ct (Body @{ code = $parent })
if ($script:Verbose) { Write-Host ("  raw[family/join] " + $joinRaw) }
$join = J $joinRaw
Check "child joined family" (($join.familyId -ne $null) -and ($join.familyId -eq $famCreate.familyId)) "True"
Check "bad invite code -> 400" (Code "POST" "/family/join" $lt (Body @{ code = "nobody_$stamp" })) "400"
Check "join with child code -> 400" (Code "POST" "/family/join" $lt (Body @{ code = $child })) "400"
$famMe = J (Call "GET" "/family/me" $pt $null)
Check "family members = 2" $famMe.members.Count 2
$childId = ($famMe.members | Where-Object { $_.username -eq $child } | Select-Object -First 1).id
$parentId = ($famMe.members | Where-Object { $_.username -eq $parent } | Select-Object -First 1).id
Check "child id resolved from members" ($childId -ne $null) "True"

# ---------- 2. task with approval -> submit -> approve -> reward ----------
$taskRaw = Call "POST" "/tasks" $pt (Body @{
    childId = $childId; title = "SmokeTask$stamp"; requiresApproval = $true; reviewerId = $parentId
  })
if ($script:Verbose) { Write-Host ("  raw[tasks/create] " + $taskRaw) }
$task = J $taskRaw
Check "POST /tasks (needs approval)" $task.status "pending"
$taskId = $task.id
Check "start -> in_progress" ((J (Call "POST" "/tasks/$taskId/status" $ct (Body @{ action = "start" }))).status) "in_progress"
$compRaw = Call "POST" "/tasks/$taskId/complete" $ct (Body @{ note = "smoke done" })
if ($script:Verbose) { Write-Host ("  raw[tasks/complete] " + $compRaw) }
$comp = @(J $compRaw)
Check "complete -> completion pending" $comp[0].status "pending"
Check "task status unchanged by submit" ((J (Call "GET" "/tasks/$taskId" $ct $null)).status) "in_progress"
Check "duplicate submit -> 409" (Code "POST" "/tasks/$taskId/complete" $ct (Body @{ note = "again" })) "409"

$approvalId = $comp[0].approvalRequestId
Check "completion carries approvalRequestId" ($approvalId -ne $null) "True"
$pending = @(J (Call "GET" "/approvals?as=reviewer&status=pending" $pt $null))
if ($script:Verbose) { Write-Host ("  raw[approvals/pending] " + ($pending | ConvertTo-Json -Compress -Depth 4)) }
$mine = $pending | Where-Object { $_.id -eq $approvalId } | Select-Object -First 1
Check "parent sees pending approval" (($mine -ne $null) -and ($mine.id -eq $approvalId)) "True"
Check "approval canAct for reviewer" $mine.canAct "True"
Check "approval descriptor label = task title" $mine.descriptor.label "SmokeTask$stamp"
Check "approval descriptor taskId" (($mine.descriptor.taskId -ne $null) -and ($mine.descriptor.taskId -eq $taskId)) "True"

# negatives
Check "child (non-reviewer) approve -> 403" (Code "POST" "/approvals/$approvalId/approve" $ct (Body @{})) "403"
Check "reject without comment -> 400" (Code "POST" "/approvals/$approvalId/reject" $pt (Body @{})) "400"
Check "approve by reviewer -> 201" (Code "POST" "/approvals/$approvalId/approve" $pt (Body @{})) "201"
Check "duplicate approve -> 409" (Code "POST" "/approvals/$approvalId/approve" $pt (Body @{})) "409"
Check "task completed after approve" ((J (Call "GET" "/tasks/$taskId" $ct $null)).status) "completed"

# reward granted exactly once
$grants = Q "SELECT COUNT(*) FROM reward_grants g JOIN task_completions c ON c.id=g.completion_id WHERE c.task_id='$taskId';"
CheckDb "reward grants == 1" $grants "1"
$growth = J (Call "GET" "/growth/me" $ct $null)
Check "growth xp > 0" ([double]$growth.xp -gt 0) "True"

# ---------- 3. multi-tenant: no-family user must see nothing ----------
$loneList = @(J (Call "GET" "/approvals" $lt $null))
Check "no-family approvals list is empty" $loneList.Count 0
Check "no-family create task -> 400" (Code "POST" "/tasks" $lt (Body @{ childId = $childId; title = "x" })) "400"
Check "no-family family/me has null familyId" ((J (Call "GET" "/family/me" $lt $null)).familyId) ""

# ---------- 4. PATCH guard: self-review + reviewer must be a family member ----------
$task2 = J (Call "POST" "/tasks" $pt (Body @{ childId = $childId; title = "PatchTask$stamp"; requiresApproval = $true; reviewerId = $parentId }))
Check "PATCH reviewer=child -> 400 self_review_forbidden" (Code "PATCH" "/tasks/$($task2.id)" $pt (Body @{ reviewerId = $childId })) "400"
Check "PATCH reviewer=outsider -> 400 reviewer_not_found" (Code "PATCH" "/tasks/$($task2.id)" $pt (Body @{ reviewerId = [guid]::NewGuid().ToString() })) "400"
# range guard must use the stored startAt when the request only sends endAt
$startAt = (Get-Date).AddHours(2).ToUniversalTime().ToString("o")
$task3 = J (Call "POST" "/tasks" $pt (Body @{ childId = $childId; title = "RangeTask$stamp"; startAt = $startAt }))
Check "task with startAt created" ($task3.startAt -ne $null) "True"
Check "PATCH endAt before stored startAt -> 400 invalid_range" (Code "PATCH" "/tasks/$($task3.id)" $pt (Body @{ endAt = (Get-Date).ToUniversalTime().ToString("o") })) "400"
# pending completion must block turning approval off (else a second completion + second grant)
$task4 = J (Call "POST" "/tasks" $pt (Body @{ childId = $childId; title = "FlipTask$stamp"; requiresApproval = $true; reviewerId = $parentId }))
Call "POST" "/tasks/$($task4.id)/complete" $ct (Body @{ note = "pending" }) | Out-Null
Check "PATCH approval off while pending -> 409" (Code "PATCH" "/tasks/$($task4.id)" $pt (Body @{ requiresApproval = $false })) "409"
CheckDb "no second completion created" (Q "SELECT COUNT(*) FROM task_completions WHERE task_id='$($task4.id)';") "1"

# ---------- 5. cleanup ----------
$userFilter = "(SELECT id FROM users WHERE username IN ('$parent','$child','$lone'))"
Q "DELETE FROM approval_records WHERE request_id IN (SELECT id FROM approval_requests WHERE applicant_id IN $userFilter OR reviewer_id IN $userFilter);" | Out-Null
Q "DELETE FROM approval_requests WHERE applicant_id IN $userFilter OR reviewer_id IN $userFilter;" | Out-Null
Q "DELETE FROM users WHERE username IN ('$parent','$child','$lone');" | Out-Null
$left = Q "SELECT COUNT(*) FROM users WHERE username IN ('$parent','$child','$lone');"
CheckDb "cleanup removed smoke users" $left "0"

Write-Output ("=== RESULT: pass={0} fail={1} skip={2} ===" -f $script:pass, $script:fail, $script:skip)
if ($script:skip -gt 0) { Write-Output "NOTE: DB checks were skipped (psql unavailable) - smoke test data may remain in the database." }
if ($script:fail -gt 0) { exit 1 }
