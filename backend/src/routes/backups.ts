import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { logActivity, getClientIp } from '../utils/activityLogger';

const router = express.Router();

// GET /api/backups - Get all backups
router.get('/', async (req, res) => {
  try {
    const backups = await prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: backups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/backups/schedules - Get backup schedules (must be before /:id)
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await prisma.backupSchedule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Parse tables JSON
    const formattedSchedules = schedules.map(schedule => {
      let tables: string[] = [];
      try {
        tables = JSON.parse(schedule.tables || '[]');
      } catch {
        tables = [];
      }

      return {
        ...schedule,
        tables,
      };
    });

    res.json({ data: formattedSchedules });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/backups/import - Import and restore from backup file (must be before /:id)
router.post('/import', async (req, res) => {
  try {
    const backupData = req.body;

    if (!backupData.name || !backupData.type) {
      return res.status(400).json({ error: 'Invalid backup file format. Missing required fields.' });
    }


    // Validate backup data structure
    const requiredFields = ['name', 'type', 'status', 'createdAt'];
    const missingFields = requiredFields.filter(field => !backupData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Invalid backup file. Missing fields: ${missingFields.join(', ')}`
      });
    }

    // Create a new backup record from the imported data
    const importedBackup = await prisma.backup.create({
      data: {
        id: randomUUID(),
        name: `${backupData.name} (Imported)`,
        tables: typeof backupData.tables === 'string' ? backupData.tables : (backupData.tables || 'All Tables'),
        type: backupData.type || 'full',
        size: backupData.size || '0 MB',
        status: 'completed',
        createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        createdBy: backupData.createdBy || 'Imported',
      },
    });


    // Simulate restore process
    // In production, implement actual restore logic here based on backupData

    // Simulate restore delay
    setTimeout(() => {
    }, 2000);

    res.json({
      message: `Backup imported and restored successfully`,
      success: true,
      backupName: backupData.name,
      backupId: importedBackup.id
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/backups/:id/download - Download backup (must be before /:id)
router.get('/:id/download', async (req, res) => {
  try {
    const backup = await prisma.backup.findUnique({
      where: { id: req.params.id },
    });

    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    if (backup.status !== 'completed') {
      return res.status(400).json({ error: 'Backup is not completed' });
    }


    // Create backup metadata JSON
    const backupData = {
      name: backup.name,
      type: backup.type,
      tables: backup.tables,
      size: backup.size,
      status: backup.status,
      createdAt: backup.createdAt,
      createdBy: backup.createdBy,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      note: 'This is a backup metadata file. In production, this would contain the actual database backup file.',
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${backup.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(backupData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/backups/:id - Get single backup (must be after specific routes)
router.get('/:id', async (req, res) => {
  try {
    const backup = await prisma.backup.findUnique({
      where: { id: req.params.id },
    });

    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.json({ data: backup });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/backups - Create new backup
router.post('/', async (req, res) => {
  try {
    const {
      name,
      type,
      tables,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Backup name is required' });
    }

    const tablesStr = type === 'full' ? 'All Tables' : (tables || []).join(', ');

    const backup = await prisma.backup.create({
      data: {
        id: randomUUID(),
        name,
        tables: tablesStr,
        type: type || 'full',
        size: '0 MB',
        status: 'in_progress',
        createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        createdBy: 'Admin User',
      },
    });

    // Simulate backup process with progress updates (in production, this would be async)
    // Update progress every 300ms for ~3-4 seconds total
    let progress = 0;
    const finalSize = Math.floor(Math.random() * 100 + 50); // Random size between 50-150 MB
    const progressInterval = setInterval(async () => {
      progress += 8; // Increment by 8% each time
      const currentSizeMB = Math.floor((progress / 100) * finalSize);

      try {
        if (progress < 100) {
          await prisma.backup.update({
            where: { id: backup.id },
            data: {
              size: `${currentSizeMB} MB`,
            },
          });
        } else {
          clearInterval(progressInterval);
          // Final update to completed
          await prisma.backup.update({
            where: { id: backup.id },
            data: {
              status: 'completed',
              size: `${finalSize} MB`,
            },
          });

          // Log activity when backup completes
          await logActivity({
            user: backup.createdBy || 'System',
            userRole: 'Admin',
            action: 'System Backup',
            actionType: 'backup',
            module: 'Backup',
            description: `Completed backup: ${backup.name} (${backup.size})`,
            ipAddress: getClientIp(req),
            status: 'success',
            details: { backupId: backup.id, type: backup.type, size: backup.size },
          });
        }
      } catch (error) {
        clearInterval(progressInterval);
      }
    }, 300);

    // Log activity when backup starts
    await logActivity({
      user: backup.createdBy || 'System',
      userRole: 'Admin',
      action: 'System Backup',
      actionType: 'backup',
      module: 'Backup',
      description: `Started backup: ${backup.name}`,
      ipAddress: getClientIp(req),
      status: 'success',
      details: { backupId: backup.id, type: backup.type },
    });

    res.status(201).json({ data: backup });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/backups/:id/restore - Restore from backup
router.post('/:id/restore', async (req, res) => {
  try {
    const backup = await prisma.backup.findUnique({
      where: { id: req.params.id },
    });

    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    if (backup.status !== 'completed') {
      return res.status(400).json({ error: 'Backup is not completed' });
    }

    // Simulate restore process
    // In production, implement actual restore logic here

    // Simulate restore delay
    setTimeout(() => {
    }, 2000);

    res.json({
      message: `Restoring from backup: ${backup.name}`,
      success: true,
      backupName: backup.name
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/backups/:id - Delete backup
router.delete('/:id', async (req, res) => {
  try {
    await prisma.backup.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Backup deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Backup not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;

