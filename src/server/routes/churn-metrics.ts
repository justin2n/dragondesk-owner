import express from 'express';
import { pool } from '../models/database';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM churn_metrics ORDER BY "cancelledAt" DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get churn metrics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const { startDate, endDate, programType, accountType } = req.query;

    const params: any[] = [];
    let sql = 'SELECT * FROM churn_metrics WHERE 1=1';

    if (startDate) {
      params.push(startDate);
      sql += ` AND "cancelledAt" >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND "cancelledAt" <= $${params.length}`;
    }
    if (programType) {
      params.push(programType);
      sql += ` AND "programType" = $${params.length}`;
    }
    if (accountType) {
      params.push(accountType);
      sql += ` AND "accountType" = $${params.length}`;
    }

    sql += ' ORDER BY "cancelledAt" DESC';

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get churn metrics summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

    const result = await pool.query(
      `INSERT INTO churn_metrics (
        "memberId", "firstName", "lastName", email, "accountType", "programType",
        "membershipAge", "cancelledBy", "cancellationReason"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [memberId, firstName, lastName, email, accountType, programType, membershipAge, cancelledBy, cancellationReason || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create churn metric error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (startDate) {
      params.push(startDate);
      where += ` AND "cancelledAt" >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      where += ` AND "cancelledAt" <= $${params.length}`;
    }

    const [totalResult, programResult, accountResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS "totalChurn" FROM churn_metrics ${where}`, params),
      pool.query(`SELECT "programType", COUNT(*)::int AS count FROM churn_metrics ${where} GROUP BY "programType"`, params),
      pool.query(`SELECT "accountType", COUNT(*)::int AS count FROM churn_metrics ${where} GROUP BY "accountType"`, params),
    ]);

    res.json({
      totalChurn: totalResult.rows[0].totalChurn,
      byProgram: programResult.rows,
      byAccountType: accountResult.rows,
    });
  } catch (error) {
    console.error('Get churn stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
