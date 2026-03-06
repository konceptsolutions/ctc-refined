#!/bin/bash

# Database Backup Script for PostgreSQL
# This script creates a full backup of the koncepts_dev database

# Configuration
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="koncepts_user"
DB_PASSWORD="Postgress"
DB_NAME="koncepts_dev"

# Backup directory
BACKUP_DIR="/var/www/nextapp/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="full_backup_${DB_NAME}_${TIMESTAMP}.sql"
COMPRESSED_FILE="full_backup_${DB_NAME}_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting database backup at $(date)"
echo "Database: $DB_NAME"
echo "Backup file: $BACKUP_FILE"

# Set PGPASSWORD environment variable for pg_dump
export PGPASSWORD="$DB_PASSWORD"

# Create the backup
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --verbose \
    --no-password \
    --format=custom \
    --compress=9 \
    --file="$BACKUP_DIR/$COMPRESSED_FILE"

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully!"
    echo "Backup saved to: $BACKUP_DIR/$COMPRESSED_FILE"
    
    # Get file size
    FILE_SIZE=$(du -h "$BACKUP_DIR/$COMPRESSED_FILE" | cut -f1)
    echo "Backup file size: $FILE_SIZE"
    
    # Create a plain SQL backup as well (optional)
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose \
        --no-password \
        --format=plain \
        --file="$BACKUP_DIR/$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        echo "Plain SQL backup also created: $BACKUP_DIR/$BACKUP_FILE"
        PLAIN_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
        echo "Plain SQL file size: $PLAIN_SIZE"
    fi
    
    # List all backup files
    echo -e "\nAll backup files in $BACKUP_DIR:"
    ls -la "$BACKUP_DIR"/*.sql* 2>/dev/null || echo "No backup files found"
    
else
    echo "ERROR: Backup failed!"
    exit 1
fi

# Clean up old backups (keep last 10 backups)
echo -e "\nCleaning up old backups (keeping last 10)..."
cd "$BACKUP_DIR"
ls -t full_backup_${DB_NAME}_*.sql.gz | tail -n +11 | xargs -r rm
ls -t full_backup_${DB_NAME}_*.sql | tail -n +11 | xargs -r rm

echo "Backup process completed at $(date)"

# Unset password
unset PGPASSWORD
