import { Router, Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { get, run } from '../models/database';
import { User } from '../types';
import { authenticateToken, authorizeAdmin } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authenticateToken, authorizeAdmin, async (req, res) => {
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

router.post('/login', loginLimiter, async (req, res) => {
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

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT expiry
      path: '/',
    });

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

// Restore session from HttpOnly cookie (called on page load)
router.get('/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No session' });

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id, username, email, role, firstName, lastName FROM users WHERE id = ?', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ token, user });
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
});

// Clear the session cookie
router.post('/logout', (_req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
  res.json({ success: true });
});

router.post('/init-admin', async (req, res) => {
  try {
    const initSecret = process.env.INIT_ADMIN_SECRET;

    // Endpoint is disabled unless INIT_ADMIN_SECRET is explicitly set in the environment
    if (!initSecret) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { secret, password } = req.body;

    if (!secret || secret !== initSecret) {
      return res.status(403).json({ error: 'Invalid secret' });
    }

    if (!password || password.length < 12) {
      return res.status(400).json({ error: 'Password must be at least 12 characters' });
    }

    const existingAdmin = await get('SELECT id FROM users WHERE role = ?', ['admin']);

    if (existingAdmin) {
      return res.status(409).json({ error: 'Admin user already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await run(
      'INSERT INTO users (username, email, password, role, firstName, lastName) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin', 'admin@dragondesk.com', hashedPassword, 'admin', 'System', 'Administrator']
    );

    res.status(201).json({ message: 'Admin user created.', userId: result.id });
  } catch (error) {
    console.error('Init admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
