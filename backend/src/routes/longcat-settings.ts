import express from 'express';
import prisma from '../config/database';
import fetch from 'node-fetch';

const router = express.Router();

// GET /api/longcat-settings - Get LongCat settings
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.longCatSettings.findFirst();

    if (!settings) {
      return res.json({
        data: {
          apiKey: '',
          model: 'LongCat-Flash-Chat',
          baseUrl: 'https://api.longcat.chat',
        },
      });
    }

    res.json({
      data: {
        apiKey: settings.apiKey || '',
        model: settings.model || 'LongCat-Flash-Chat',
        baseUrl: settings.baseUrl || 'https://api.longcat.chat',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/longcat-settings - Update LongCat settings
router.put('/', async (req, res) => {
  try {
    const {
      apiKey,
      model,
      baseUrl,
    } = req.body;

    let settings = await prisma.longCatSettings.findFirst();

    const data: any = {};
    if (apiKey !== undefined) data.apiKey = apiKey || null;
    if (model !== undefined) data.model = model || 'LongCat-Flash-Chat';
    if (baseUrl !== undefined) data.baseUrl = baseUrl || 'https://api.longcat.chat';

    if (settings) {
      settings = await prisma.longCatSettings.update({
        where: { id: settings.id },
        data,
      });
    } else {
      settings = await prisma.longCatSettings.create({
        data,
      });
    }

    res.json({
      data: {
        apiKey: settings.apiKey || '',
        model: settings.model || 'LongCat-Flash-Chat',
        baseUrl: settings.baseUrl || 'https://api.longcat.chat',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/longcat-settings/chat - Send chat completion request
router.post('/chat', async (req, res) => {
  try {
    const {
      messages,
      model: requestModel,
      max_tokens,
      temperature,
      stream,
      enable_thinking,
      thinking_budget,
    } = req.body;

    // Get LongCat settings
    const settings = await prisma.longCatSettings.findFirst();
    
    if (!settings || !settings.apiKey) {
      return res.status(400).json({ 
        error: 'LongCat API key not configured. Please configure API key in settings.' 
      });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const apiKey = settings.apiKey;
    const baseUrl = settings.baseUrl || 'https://api.longcat.chat';
    const model = requestModel || settings.model || 'LongCat-Flash-Chat';

    // Prepare request body
    const requestBody: any = {
      model,
      messages,
    };

    if (max_tokens !== undefined) requestBody.max_tokens = max_tokens;
    if (temperature !== undefined) requestBody.temperature = temperature;
    if (stream !== undefined) requestBody.stream = stream;
    if (enable_thinking !== undefined) requestBody.enable_thinking = enable_thinking;
    if (thinking_budget !== undefined) requestBody.thinking_budget = thinking_budget;

    // Send request to LongCat API (OpenAI-compatible endpoint)
    const response = await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    let responseData;
    try {
      if (stream) {
        // For streaming responses, return the stream
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({ 
            error: 'Failed to get streaming response from LongCat API',
            details: errorText 
          });
        }

        // Pipe the stream
        response.body?.pipe(res);
        return;
      } else {
        responseData = await response.json();
      }
    } catch (e) {
      const text = await response.text();
      return res.status(500).json({ 
        error: 'Invalid response from LongCat API',
        details: text 
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: responseData.error?.message || 'Failed to get response from LongCat API',
        details: responseData 
      });
    }

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send chat request to LongCat API' });
  }
});

// POST /api/longcat-settings/messages - Send message using Anthropic format
router.post('/messages', async (req, res) => {
  try {
    const {
      messages,
      system,
      model: requestModel,
      max_tokens,
      temperature,
      stream,
      enable_thinking,
      thinking_budget,
    } = req.body;

    // Get LongCat settings
    const settings = await prisma.longCatSettings.findFirst();
    
    if (!settings || !settings.apiKey) {
      return res.status(400).json({ 
        error: 'LongCat API key not configured. Please configure API key in settings.' 
      });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const apiKey = settings.apiKey;
    const baseUrl = settings.baseUrl || 'https://api.longcat.chat';
    const model = requestModel || settings.model || 'LongCat-Flash-Chat';

    // Prepare request body
    const requestBody: any = {
      model,
      messages,
    };

    if (system !== undefined) requestBody.system = system;
    if (max_tokens !== undefined) requestBody.max_tokens = max_tokens;
    if (temperature !== undefined) requestBody.temperature = temperature;
    if (stream !== undefined) requestBody.stream = stream;
    if (enable_thinking !== undefined) requestBody.enable_thinking = enable_thinking;
    if (thinking_budget !== undefined) requestBody.thinking_budget = thinking_budget;

    // Send request to LongCat API (Anthropic-compatible endpoint)
    const response = await fetch(`${baseUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    let responseData;
    try {
      if (stream) {
        // For streaming responses, return the stream
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({ 
            error: 'Failed to get streaming response from LongCat API',
            details: errorText 
          });
        }

        // Pipe the stream
        response.body?.pipe(res);
        return;
      } else {
        responseData = await response.json();
      }
    } catch (e) {
      const text = await response.text();
      return res.status(500).json({ 
        error: 'Invalid response from LongCat API',
        details: text 
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: responseData.error?.message || 'Failed to get response from LongCat API',
        details: responseData 
      });
    }

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send message request to LongCat API' });
  }
});

export default router;

