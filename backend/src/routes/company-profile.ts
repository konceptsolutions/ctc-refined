import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';

const router = express.Router();

// GET /api/company-profile - Get company profile
router.get('/', async (req, res) => {
  try {
    let profile = await prisma.companyProfile.findFirst();

    if (!profile) {
      // Return default empty profile
      return res.json({
        data: {
          companyInfo: {},
          systemSettings: {},
          invoiceSettings: {},
          notificationSettings: {},
        },
      });
    }

    // Parse JSON fields
    let companyInfo = {};
    let systemSettings = {};
    let invoiceSettings = {};
    let notificationSettings = {};

    try {
      companyInfo = JSON.parse(profile.companyInfo || '{}');
    } catch {
      companyInfo = {};
    }

    try {
      systemSettings = JSON.parse(profile.systemSettings || '{}');
    } catch {
      systemSettings = {};
    }

    try {
      invoiceSettings = JSON.parse(profile.invoiceSettings || '{}');
    } catch {
      invoiceSettings = {};
    }

    try {
      notificationSettings = JSON.parse(profile.notificationSettings || '{}');
    } catch {
      notificationSettings = {};
    }

    res.json({
      data: {
        companyInfo,
        systemSettings,
        invoiceSettings,
        notificationSettings,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/company-profile - Update company profile
router.put('/', async (req, res) => {
  try {
    const {
      companyInfo,
      systemSettings,
      invoiceSettings,
      notificationSettings,
    } = req.body;

    let profile = await prisma.companyProfile.findFirst();

    const data = {
      companyInfo: JSON.stringify(companyInfo || {}),
      systemSettings: JSON.stringify(systemSettings || {}),
      invoiceSettings: JSON.stringify(invoiceSettings || {}),
      notificationSettings: JSON.stringify(notificationSettings || {}),
    };

    if (profile) {
      profile = await prisma.companyProfile.update({
        where: { id: profile.id },
        data,
      });
    } else {
      profile = await prisma.companyProfile.create({
        data: {
          id: randomUUID(),
          ...data,
          updatedAt: new Date(),
        },
      });
    }

    res.json({
      data: {
        companyInfo: JSON.parse(profile.companyInfo || '{}'),
        systemSettings: JSON.parse(profile.systemSettings || '{}'),
        invoiceSettings: JSON.parse(profile.invoiceSettings || '{}'),
        notificationSettings: JSON.parse(profile.notificationSettings || '{}'),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

