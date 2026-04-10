import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get, run } from '../models/database';
import { User } from '../types';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role, firstName, lastName } = req.body;

    if (!username || !email || !password || !role || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (role !== 'admin' && role !== 'staff') {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existingUser = await get('SELECT id FROM users WHERE username = ? OR email = ?', [
      username,
      email,
    ]);

    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await run(
      'INSERT INTO users (username, email, password, role, firstName, lastName) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, role, firstName, lastName]
    );

    res.status(201).json({
      message: 'User registered successfully',
      userId: result.id,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user: User = await get('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);

    // Re-fetch user to pick up any role changes
    const user = await get('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newToken = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token: newToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

router.post('/init-admin', async (req, res) => {
  try {
    const existingAdmin = await get('SELECT id FROM users WHERE role = ?', ['admin']);

    if (existingAdmin) {
      return res.status(409).json({ error: 'Admin user already exists' });
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);

    const result = await run(
      'INSERT INTO users (username, email, password, role, firstName, lastName) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin', 'admin@dragondesk.com', hashedPassword, 'admin', 'System', 'Administrator']
    );

    res.status(201).json({
      message: 'Default admin user created successfully',
      credentials: {
        username: 'admin',
        password: 'admin123',
        note: 'Please change this password immediately',
      },
    });
  } catch (error) {
    console.error('Init admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
