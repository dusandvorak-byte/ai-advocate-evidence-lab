param(
    [Parameter(Mandatory = $true)]
    [string]$BundlePath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BundlePath -PathType Leaf)) {
    throw "STOP: Publikacni balicek neexistuje: $BundlePath"
}

if (-not (Test-Path -LiteralPath ".git" -PathType Container)) {
    throw "STOP: Prikaz spustte v repozitari ai-advocate-evidence-lab."
}

if ((git branch --show-current).Trim() -ne "main") {
    throw "STOP: Nejste na vetvi main."
}

if (git status --porcelain) {
    throw "STOP: Pracovni slozka neni cista. Nejprve zkontrolujte git status --short."
}

git bundle verify $BundlePath
if ($LASTEXITCODE -ne 0) { throw "STOP: Balicek neprosel kontrolou." }

git fetch $BundlePath main
if ($LASTEXITCODE -ne 0) { throw "STOP: Balicek se nepodarilo nacist." }

git merge --ff-only FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "STOP: Aktualizaci nelze bezpecne sloucit." }

git push github main
if ($LASTEXITCODE -ne 0) { throw "STOP: Aktualizaci se nepodarilo odeslat na GitHub." }

Write-Host "HOTOVO: CannaInsider byl odeslan na GitHub." -ForegroundColor Green
