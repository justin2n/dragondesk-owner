import express from 'express';
import { query, run, get } from '../models/database';

const router = express.Router();

// Get all churn metrics
router.get('/', async (req, res) => {
  try {
    const churnMetrics = await query('SELECT * FROM churn_metrics ORDER BY cancelledAt DESC');
    res.json(churnMetrics);
  } catch (error) {
    console.error('Get churn metrics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get churn metrics with filters
router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate, programType, accountType } = req.query;

    let sql = 'SELECT * FROM churn_metrics WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      sql += ' AND cancelledAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND cancelledAt <= ?';
      params.push(endDate);
    }

    if (programType) {
      sql += ' AND programType = ?';
      params.push(programType);
    }

    if (accountType) {
      sql += ' AND accountType = ?';
      params.push(accountType);
    }

    sql += ' ORDER BY cancelledAt DESC';

    const churnMetrics = await query(sql, params);
    res.json(churnMetrics);
  } catch (error) {
    console.error('Get churn metrics summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Record a new churn metric
router.post('/', async (req, res) => {
  try {
    const {
      memberId,
      firstName,
      lastName,
      email,
      accountType,
      programType,
      membershipAge,
      cancellationReason,
    } = req.body;

    const cancelledBy = (req as any).user?.id || null;

    const result = await run(
      `INSERT INTO churn_metrics (
        memberId, firstName, lastName, email, accountType, programType,
        membershipAge, cancelledBy, cancellationReason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memberId, firstName, lastName, email, accountType, programType,
        membershipAge, cancelledBy, cancellationReason || null
      ]
    );

    const newChurnMetric = await get('SELECT * FROM churn_metrics WHERE id = ?', [result.id]);
    res.status(201).json(newChurnMetric);
  } catch (error) {
    console.error('Create churn metric error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get churn statistics
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let sql = 'SELECT COUNT(*) as totalChurn FROM churn_metrics WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      sql += ' AND cancelledAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND cancelledAt <= ?';
      params.push(endDate);
    }

    const totalChurn = await get(sql, params);

    // Get churn by program type
    let programSql = 'SELECT programType, COUNT(*) as count FROM churn_metrics WHERE 1=1';
    const programParams: any[] = [];

    if (startDate) {
      programSql += ' AND cancelledAt >= ?';
      programParams.push(startDate);
    }

    if (endDate) {
      programSql += ' AND cancelledAt <= ?';
      programParams.push(endDate);
    }

    programSql += ' GROUP BY programType';
    const byProgram = await query(programSql, programParams);

    // Get churn by account type
    let accountSql = 'SELECT accountType, COUNT(*) as count FROM churn_metrics WHERE 1=1';
    const accountParams: any[] = [];

    if (startDate) {
      accountSql += ' AND cancelledAt >= ?';
      accountParams.push(startDate);
    }

    if (endDate) {
      accountSql += ' AND cancelledAt <= ?';
      accountParams.push(endDate);
    }

    accountSql += ' GROUP BY accountType';
    const byAccountType = await query(accountSql, accountParams);

    res.json({
      totalChurn: totalChurn.totalChurn,
      byProgram,
      byAccountType,
    });
  } catch (error) {
    console.error('Get churn stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
