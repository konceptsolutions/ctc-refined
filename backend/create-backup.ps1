# PowerShell Database Backup Script
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$filename = "nextapp_backup_$timestamp.sql"
$env:PGPASSWORD = "postgres"

Write-Host "Starting backup to $filename..." -ForegroundColor Cyan

$pgDumpPath = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
& $pgDumpPath -h localhost -p 5432 -U postgres -f $filename koncepts_dev

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup completed successfully: $filename" -ForegroundColor Green
} else {
    Write-Host "Backup failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
