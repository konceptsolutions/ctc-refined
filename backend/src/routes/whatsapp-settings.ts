import express from 'express';
import prisma from '../config/database';
import FormData from 'form-data';
import fetch from 'node-fetch';

const router = express.Router();

// GET /api/whatsapp-settings - Get WhatsApp settings
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.whatsAppSettings.findFirst();

    if (!settings) {
      return res.json({
        data: {
          appKey: '',
          authKey: '',
          administratorPhoneNumber: '',
        },
      });
    }

    res.json({
      data: {
        appKey: settings.appKey || '',
        authKey: settings.authKey || '',
        administratorPhoneNumber: settings.administratorPhoneNumber || '',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/whatsapp-settings - Update WhatsApp settings
router.put('/', async (req, res) => {
  try {
    const {
      appKey,
      authKey,
      administratorPhoneNumber,
    } = req.body;

    let settings = await prisma.whatsAppSettings.findFirst();

    const data: any = {};
    if (appKey !== undefined) data.appKey = appKey || null;
    if (authKey !== undefined) data.authKey = authKey || null;
    if (administratorPhoneNumber !== undefined) data.administratorPhoneNumber = administratorPhoneNumber || null;

    if (settings) {
      settings = await prisma.whatsAppSettings.update({
        where: { id: settings.id },
        data,
      });
    } else {
      settings = await prisma.whatsAppSettings.create({
        data,
      });
    }

    res.json({
      data: {
        appKey: settings.appKey || '',
        authKey: settings.authKey || '',
        administratorPhoneNumber: settings.administratorPhoneNumber || '',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/whatsapp-settings/send-message - Send WhatsApp message
router.post('/send-message', async (req, res) => {
  try {
    const {
      to,
      message,
      file,
      template_id,
      variables,
    } = req.body;

    // Get WhatsApp settings
    const settings = await prisma.whatsAppSettings.findFirst();
    
    if (!settings || !settings.appKey || !settings.authKey) {
      return res.status(400).json({ 
        error: 'WhatsApp API credentials not configured. Please configure App Key and Auth Key in settings.' 
      });
    }

    if (!to) {
      return res.status(400).json({ error: 'Receiver phone number (to) is required' });
    }

    // Create form data
    const formData = new FormData();
    formData.append('appkey', settings.appKey);
    formData.append('authkey', settings.authKey);
    formData.append('to', to);

    // Add message if provided
    if (message) {
      formData.append('message', message);
    }

    // Add file if provided
    if (file) {
      formData.append('file', file);
    }

    // Add template_id if provided
    if (template_id) {
      formData.append('template_id', template_id);
    }

    // Add variables if provided (should be an object)
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach((key) => {
        formData.append(`variables[${key}]`, variables[key]);
      });
    }

    // Send request to WhatsApp API
    const response = await fetch('https://wapi.aiwatech.com/api/create-message', {
      method: 'POST',
      body: formData,
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      const text = await response.text();
      return res.status(500).json({ 
        error: 'Invalid response from WhatsApp API',
        details: text 
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: responseData.error || 'Failed to send WhatsApp message',
        details: responseData 
      });
    }

    res.json({
      message_status: 'Success',
      data: responseData,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send WhatsApp message' });
  }
});

export default router;

