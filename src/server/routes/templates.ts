import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query, run, get } from '../models/database';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Get all email templates
router.get('/', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const templates = await query('SELECT * FROM email_templates ORDER BY isDefault DESC, createdAt DESC');
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get single template
router.get('/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const template = await get('SELECT * FROM email_templates WHERE id = ?', [req.params.id]);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create email template
router.post('/', requireRole(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { name, description, subject, body, thumbnail, isDefault } = req.body;
    const userId = req.user?.id;

    if (!name || !body) {
      return res.status(400).json({ error: 'Name and body are required' });
    }

    const result = await run(
      `INSERT INTO email_templates (name, description, subject, body, thumbnail, isDefault, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, description, subject, body, thumbnail, isDefault ? 1 : 0, userId]
    );

    const template = await get('SELECT * FROM email_templates WHERE id = ?', [result.id]);
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update email template
router.put('/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { name, description, subject, body, thumbnail, isDefault } = req.body;

    await run(
      `UPDATE email_templates
       SET name = ?, description = ?, subject = ?, body = ?, thumbnail = ?, isDefault = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, subject, body, thumbnail, isDefault ? 1 : 0, req.params.id]
    );

    const template = await get('SELECT * FROM email_templates WHERE id = ?', [req.params.id]);
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete email template
router.delete('/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    await run('DELETE FROM email_templates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Upload image
router.post('/upload-image', requireRole(['super_admin', 'admin']), upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const userId = req.user?.id;
    const url = `/uploads/images/${req.file.filename}`;

    const result = await run(
      `INSERT INTO email_images (filename, originalName, mimeType, size, url, uploadedBy)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, url, userId]
    );

    const image = await get('SELECT * FROM email_images WHERE id = ?', [result.id]);
    res.status(201).json(image);
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Get all uploaded images
router.get('/images/list', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const images = await query('SELECT * FROM email_images ORDER BY uploadedAt DESC');
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Delete uploaded image
router.delete('/images/:id', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const image = await get('SELECT * FROM email_images WHERE id = ?', [req.params.id]);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../uploads/images', image.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await run('DELETE FROM email_images WHERE id = ?', [req.params.id]);
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

export default router;
