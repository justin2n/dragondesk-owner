import express from 'express';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all programs
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const programs = await query('SELECT * FROM programs ORDER BY name ASC');
    res.json(programs);
  } catch (error: any) {
    console.error('Error fetching programs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active programs only
router.get('/active', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const programs = await query('SELECT * FROM programs WHERE isActive = 1 ORDER BY name ASC');
    res.json(programs);
  } catch (error: any) {
    console.error('Error fetching active programs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new program
router.post('/', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Program name is required' });
    }

    // Check if program already exists
    const existing = await get('SELECT id FROM programs WHERE name = ?', [name]);
    if (existing) {
      return res.status(409).json({ error: 'Program with this name already exists' });
    }

    const result = await run(
      'INSERT INTO programs (name, description) VALUES (?, ?)',
      [name, description || null]
    );

    const newProgram = await get('SELECT * FROM programs WHERE id = ?', [result.id]);
    res.status(201).json(newProgram);
  } catch (error: any) {
    console.error('Error creating program:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a program
router.put('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;

    const existing = await get('SELECT * FROM programs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    // Check if name conflicts with another program
    if (name && name !== existing.name) {
      const nameConflict = await get('SELECT id FROM programs WHERE name = ? AND id != ?', [name, id]);
      if (nameConflict) {
        return res.status(409).json({ error: 'Program with this name already exists' });
      }
    }

    await run(
      `UPDATE programs SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        isActive = COALESCE(?, isActive),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [name, description, isActive !== undefined ? (isActive ? 1 : 0) : null, id]
    );

    const updatedProgram = await get('SELECT * FROM programs WHERE id = ?', [id]);
    res.json(updatedProgram);
  } catch (error: any) {
    console.error('Error updating program:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a program
router.delete('/:id', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await get('SELECT * FROM programs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    // Check if program is in use by any members
    const membersCount = await get(
      'SELECT COUNT(*) as count FROM members WHERE programType = ?',
      [existing.name]
    );

    if (membersCount.count > 0) {
      return res.status(400).json({
        error: `Cannot delete program. ${membersCount.count} member(s) are currently enrolled in this program.`,
      });
    }

    await run('DELETE FROM programs WHERE id = ?', [id]);
    res.json({ message: 'Program deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting program:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
