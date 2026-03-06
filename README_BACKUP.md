# Database Backup Guide

## Overview
This directory contains automated backup scripts and documentation for the PostgreSQL database `koncepts_dev`.

## Backup Script
The main backup script is `backup_database.sh` which creates comprehensive backups of your database.

### Features
- Creates both compressed and plain SQL backups
- Automatic timestamp in filename
- Backup directory management
- Cleanup of old backups (keeps last 10)
- Detailed logging and verification

### Usage
```bash
# Run the backup script
./backup_database.sh

# Or run from any directory
/var/www/nextapp/backup_database.sh
```

### Backup Files
Backups are stored in `/var/www/nextapp/backups/` with the following naming convention:
- Compressed: `full_backup_koncepts_dev_YYYYMMDD_HHMMSS.sql.gz`
- Plain SQL: `full_backup_koncepts_dev_YYYYMMDD_HHMMSS.sql`

### Database Configuration
- **Host**: localhost
- **Port**: 5432
- **Database**: koncepts_dev
- **User**: koncepts_user

### Backup Contents
The backup includes:
- All tables and data
- Schema definitions
- Indexes and constraints
- Foreign key relationships
- Sequences

## Restore Instructions

### From Compressed Backup
```bash
# Restore from compressed backup
pg_restore -h localhost -p 5432 -U koncepts_user -d koncepts_dev /path/to/backup.sql.gz
```

### From Plain SQL Backup
```bash
# Restore from plain SQL backup
psql -h localhost -p 5432 -U koncepts_user -d koncepts_dev < /path/to/backup.sql
```

## Automated Backups
You can set up automated backups using cron:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /var/www/nextapp/backup_database.sh >> /var/www/nextapp/backups/backup.log 2>&1
```

## Backup Verification
After backup creation, verify:
1. File exists in backup directory
2. File size is reasonable
3. File format is correct (PostgreSQL custom format)

## Security Notes
- Backup files contain sensitive data
- Store backups in secure location
- Consider encrypting backups for long-term storage
- Regularly test restore procedures

## Troubleshooting
- Ensure PostgreSQL is running
- Verify database credentials
- Check disk space availability
- Review backup logs for errors
