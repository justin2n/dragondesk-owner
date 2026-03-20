import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, run, get } from '../models/database';
import { authenticateToken, authorizeAdmin, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const users = await query(
      `SELECT id, username, email, role, firstName, lastName, locationId,
              isInstructor, certifications, specialties, createdAt, updatedAt
       FROM users ORDER BY createdAt DESC`
    );
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const user = await get(
      `SELECT id, username, email, role, firstName, lastName, locationId,
              isInstructor, certifications, specialties, createdAt, updatedAt
       FROM users WHERE id = ?`,
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new user (admin and super_admin only)
router.post('/', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      username,
      email,
      password,
      role,
      firstName,
      lastName,
      locationId,
      isInstructor,
      certifications,
      specialties,
    } = req.body;

    // Validation
    if (!username || !email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Both admins and super_admins can create any role
    // (No restriction on creating super_admin or admin users)

    // Validate role
    const validRoles = ['super_admin', 'admin', 'staff', 'instructor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if username already exists
    const existingUsername = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    const existingEmail = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await run(
      `INSERT INTO users
       (username, email, password, role, firstName, lastName, locationId, isInstructor, certifications, specialties)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        email,
        hashedPassword,
        role,
        firstName,
        lastName,
        locationId || null,
        isInstructor ? 1 : 0,
        certifications || null,
        specialties || null,
      ]
    );

    const newUser = await get(
      `SELECT id, username, email, role, firstName, lastName, locationId,
              isInstructor, certifications, specialties, createdAt, updatedAt
       FROM users WHERE id = ?`,
      [result.id]
    );

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      role,
      firstName,
      lastName,
      email,
      locationId,
      isInstructor,
      certifications,
      specialties,
      password,
    } = req.body;

    const existingUser = await get('SELECT * FROM users WHERE id = ?', [id]);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Both admins and super_admins can modify any user
    // (No restriction on modifying super_admin or admin users)

    // Validate role if provided
    if (role) {
      const validRoles = ['super_admin', 'admin', 'staff', 'instructor'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== existingUser.email) {
      const existingEmail = await get('SELECT id FROM users WHERE email = ? AND id != ?', [
        email,
        id,
      ]);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Build update query dynamically
    let updates: string[] = [];
    let params: any[] = [];

    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (firstName !== undefined) {
      updates.push('firstName = ?');
      params.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push('lastName = ?');
      params.push(lastName);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (locationId !== undefined) {
      updates.push('locationId = ?');
      params.push(locationId || null);
    }
    if (isInstructor !== undefined) {
      updates.push('isInstructor = ?');
      params.push(isInstructor ? 1 : 0);
    }
    if (certifications !== undefined) {
      updates.push('certifications = ?');
      params.push(certifications || null);
    }
    if (specialties !== undefined) {
      updates.push('specialties = ?');
      params.push(specialties || null);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(id);

    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const updatedUser = await get(
      `SELECT id, username, email, role, firstName, lastName, locationId,
              isInstructor, certifications, specialties, createdAt, updatedAt
       FROM users WHERE id = ?`,
      [id]
    );
    res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authorizeAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existingUser = await get('SELECT * FROM users WHERE id = ?', [id]);

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (parseInt(id) === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Both admins and super_admins can delete any user
    // (No restriction on deleting super_admin or admin users)

    await run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
