import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';

const router = express.Router();

// GET /api/approval-flows - Get all approval flows
router.get('/', async (req, res) => {
  try {
    const flows = await prisma.approvalFlow.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Parse steps JSON
    const formattedFlows = flows.map(flow => {
      let steps: Array<{ role: string; action: string }> = [];
      try {
        steps = JSON.parse(flow.steps || '[]');
      } catch {
        steps = [];
      }

      return {
        ...flow,
        steps,
      };
    });

    res.json({ data: formattedFlows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/approval-flows/:id - Get single approval flow
router.get('/:id', async (req, res) => {
  try {
    const flow = await prisma.approvalFlow.findUnique({
      where: { id: req.params.id },
    });

    if (!flow) {
      return res.status(404).json({ error: 'Approval flow not found' });
    }

    let steps: Array<{ role: string; action: string }> = [];
    try {
      steps = JSON.parse(flow.steps || '[]');
    } catch {
      steps = [];
    }

    res.json({ data: { ...flow, steps } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/approval-flows - Create new approval flow
router.post('/', async (req, res) => {
  try {
    const {
      name,
      description,
      module,
      trigger,
      condition,
      steps,
      status,
    } = req.body;

    if (!name || !module) {
      return res.status(400).json({ error: 'Name and module are required' });
    }

    const flow = await prisma.approvalFlow.create({
      data: {
        id: randomUUID(),
        name,
        description: description || '',
        module,
        trigger: trigger || 'On Create',
        condition: condition || '',
        steps: JSON.stringify(steps || []),
        status: status || 'active',
        updatedAt: new Date(),
      },
    });

    let parsedSteps: Array<{ role: string; action: string }> = [];
    try {
      parsedSteps = JSON.parse(flow.steps || '[]');
    } catch {
      parsedSteps = [];
    }

    res.status(201).json({ data: { ...flow, steps: parsedSteps } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/approval-flows/:id - Update approval flow
router.put('/:id', async (req, res) => {
  try {
    const {
      name,
      description,
      module,
      trigger,
      condition,
      steps,
      status,
    } = req.body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (module !== undefined) updateData.module = module;
    if (trigger !== undefined) updateData.trigger = trigger;
    if (condition !== undefined) updateData.condition = condition;
    if (steps !== undefined) updateData.steps = JSON.stringify(steps);
    if (status !== undefined) updateData.status = status;

    const flow = await prisma.approvalFlow.update({
      where: { id: req.params.id },
      data: updateData,
    });

    let parsedSteps: Array<{ role: string; action: string }> = [];
    try {
      parsedSteps = JSON.parse(flow.steps || '[]');
    } catch {
      parsedSteps = [];
    }

    res.json({ data: { ...flow, steps: parsedSteps } });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Approval flow not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/approval-flows/:id - Delete approval flow
router.delete('/:id', async (req, res) => {
  try {
    await prisma.approvalFlow.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Approval flow deleted successfully' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Approval flow not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/approval-flows/pending - Get pending approvals
router.get('/pending', async (req, res) => {
  try {
    // This is a placeholder - implement based on your business logic
    res.json({ data: [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

