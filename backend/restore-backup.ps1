# Restore koncepts_dev from backup
# Requires: PostgreSQL bin in PATH, or run via PgAdmin (see instructions below)

$DB_USER = "postgres"
$DB_PASSWORD = "postgres"
$DB_HOST = "localhost"
$DB_PORT = "5432"
$DB_NAME = "koncepts_dev"
$BACKUP_FILE = Join-Path $PSScriptRoot "full_backup_koncepts_dev_20260310_100416.sql"

# Try to find psql
$psqlPaths = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "psql"
)
$psql = $null
foreach ($p in $psqlPaths) {
    if ($p -eq "psql") {
        $found = Get-Command psql -ErrorAction SilentlyContinue
        if ($found) { $psql = "psql"; break }
    } elseif (Test-Path $p) {
        $psql = $p
        break
    }
}

if (-not $psql) {
    Write-Host "psql not found. Use PgAdmin instead:"
    Write-Host "  1. Connect to localhost in PgAdmin"
    Write-Host "  2. Right-click koncepts_dev -> Query Tool"
    Write-Host "  3. Connect to 'postgres' database, run: DROP DATABASE IF EXISTS koncepts_dev; CREATE DATABASE koncepts_dev;"
    Write-Host "  4. Right-click koncepts_dev -> Restore -> Filename: $BACKUP_FILE, Format: Plain"
    exit 1
}

$env:PGPASSWORD = $DB_PASSWORD
$connArgs = @("-h", $DB_HOST, "-p", $DB_PORT, "-U", $DB_USER)

Write-Host "Terminating connections to $DB_NAME..."
& $psql @connArgs -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" 2>$null

Write-Host "Dropping database $DB_NAME..."
& $psql @connArgs -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to drop database"; exit 1 }

Write-Host "Creating database $DB_NAME..."
& $psql @connArgs -d postgres -c "CREATE DATABASE $DB_NAME;"
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create database"; exit 1 }

Write-Host "Restoring from $BACKUP_FILE..."
& $psql @connArgs -d $DB_NAME -f $BACKUP_FILE
if ($LASTEXITCODE -ne 0) { Write-Error "Restore failed"; exit 1 }

Write-Host "Done. koncepts_dev has been restored from backup."
