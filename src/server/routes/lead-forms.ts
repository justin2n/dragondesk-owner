import { serverError } from '../utils/errors';
import express from 'express';
import { query, run, get, pool } from '../models/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { captureLead } from '../services/leadCapture';

const router = express.Router();

// Public endpoint - no authentication required
// This allows external websites to submit leads
router.post('/submit', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      programType,
      membershipAge,
      notes,
      locationId,
      source,
      visitorId,
      token: trackingToken,
      attribution,
    } = req.body;

    const result = await captureLead({
      firstName, lastName, email, phone, programType, membershipAge,
      notes, locationId, source, visitorId, trackingToken, attribution,
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    res.status(result.isNew ? 201 : 200).json({
      success: true,
      message: result.isNew
        ? 'Lead submitted successfully! We will contact you soon.'
        : result.existingStatus === 'lead'
          ? 'Lead information updated successfully'
          : 'Thank you! We already have your information.',
      leadId: result.memberId,
    });

  } catch (error: any) {
    console.error('Error submitting lead form:', error);
    res.status(500).json({ error: 'Failed to submit form. Please try again.' });
  }
});

// Get form configuration (authenticated)
router.get('/config', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Get active locations for the form
    const locations = await query('SELECT id, name, city, state FROM locations WHERE isActive = 1 ORDER BY name ASC');

    // Get active programs for the form
    const programs = await query('SELECT id, name, description FROM programs WHERE isActive = 1 ORDER BY name ASC');

    res.json({
      locations,
      programs,
      fields: [
        { name: 'firstName', label: 'First Name', type: 'text', required: true },
        { name: 'lastName', label: 'Last Name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone', type: 'tel', required: false },
        { name: 'programType', label: 'Program Interest', type: 'select', required: false, options: programs.map((p: any) => ({ value: p.name, label: p.name })) },
        { name: 'membershipAge', label: 'Age Group', type: 'select', required: false, options: [{ value: 'Adult', label: 'Adult' }, { value: 'Kids', label: 'Kids' }] },
        { name: 'locationId', label: 'Preferred Location', type: 'select', required: false, options: locations.map((l: any) => ({ value: l.id, label: `${l.name}${l.city ? ` - ${l.city}` : ''}` })) },
        { name: 'notes', label: 'Message / Questions', type: 'textarea', required: false }
      ]
    });
  } catch (error: any) {
    console.error('Error fetching form config:', error);
    serverError(res, error);
  }
});

// Get form statistics (authenticated)
router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params: any[] = [];

    if (startDate) {
      dateFilter += ' AND createdAt >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND createdAt <= ?';
      params.push(endDate);
    }

    const stats = await get(
      `SELECT
        COUNT(*) as totalLeads,
        COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as leadsWithPhone,
        COUNT(CASE WHEN locationId IS NOT NULL THEN 1 END) as leadsWithLocation
      FROM members
      WHERE accountStatus = 'lead'${dateFilter}`,
      params
    );

    // Get leads by program
    const byProgram = await query(
      `SELECT programType, COUNT(*) as count
       FROM members
       WHERE accountStatus = 'lead'${dateFilter}
       GROUP BY programType
       ORDER BY count DESC`,
      params
    );

    // Get leads by location
    const byLocation = await query(
      `SELECT l.name as locationName, COUNT(m.id) as count
       FROM members m
       LEFT JOIN locations l ON m.locationId = l.id
       WHERE m.accountStatus = 'lead'${dateFilter}
       GROUP BY m.locationId
       ORDER BY count DESC`,
      params
    );

    // Get recent leads
    const recentLeads = await query(
      `SELECT
        id,
        firstName,
        lastName,
        email,
        phone,
        programType,
        membershipAge,
        createdAt
       FROM members
       WHERE accountStatus = 'lead'${dateFilter}
       ORDER BY createdAt DESC
       LIMIT 10`,
      params
    );

    res.json({
      ...stats,
      byProgram,
      byLocation,
      recentLeads
    });
  } catch (error: any) {
    console.error('Error fetching form stats:', error);
    serverError(res, error);
  }
});

export default router;
