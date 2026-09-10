# adversarial-review skill installer (Windows PowerShell)
[CmdletBinding()]
param(
    [string]$TargetDir = (Join-Path $env:USERPROFILE ".claude\skills")
)

$ErrorActionPreference = "Stop"

$SkillName = "adversarial-review"
$RepoUrl   = "https://github.com/RevolutionLA/adversarial-review.git"
$Dest      = Join-Path $TargetDir $SkillName

function Write-Info($m) { Write-Host "[info] $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "[ ok ] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "[warn] $m" -ForegroundColor Yellow }
function Write-Fail($m) { Write-Host "[fail] $m" -ForegroundColor Red; exit 1 }

Write-Info "installing $SkillName -> $Dest"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("advreview-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
    $hasGit = $null -ne (Get-Command git -ErrorAction SilentlyContinue)
    if ($hasGit) {
        git clone --depth 1 $RepoUrl (Join-Path $tmp $SkillName) 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Fail "git clone failed. Check network access to $RepoUrl" }
    }
    else {
        Write-Warn2 "git not found, falling back to zip download"
        $zipUrl = "https://codeload.github.com/RevolutionLA/$SkillName/zip/refs/heads/main"
        $zip    = Join-Path $tmp "skill.zip"
        Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp "x") -Force
        Move-Item (Join-Path $tmp "x\$SkillName-main") (Join-Path $tmp $SkillName)
    }

    $srcSkill = Join-Path $tmp "$SkillName\SKILL.md"
    if (-not (Test-Path $srcSkill)) { Write-Fail "SKILL.md missing in downloaded repo" }

    if (Test-Path $Dest) {
        Write-Warn2 "existing install found, replacing: $Dest"
        Remove-Item -Recurse -Force $Dest
    }
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Copy-Item -Recurse -Force (Join-Path $tmp "$SkillName\*") $Dest

    # sanity check: frontmatter name must match directory name (Agent Skills spec)
    $headName = (Select-String -Path (Join-Path $Dest "SKILL.md") -Pattern '^name:\s*(.+)$' |
                 Select-Object -First 1).Matches[0].Groups[1].Value.Trim()
    if ($headName -ne $SkillName) { Write-Fail "frontmatter name '$headName' != directory '$SkillName'" }

    Write-Ok "installed: $Dest"
    Write-Ok "frontmatter name verified: $headName"
    Write-Host ""
    Write-Host 'Next: restart your agent, then say "跑一次蓝军评审" or "adversarial review this module".'
}
finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
