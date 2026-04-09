import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../models/database';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get attendance summary for a member
router.get('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    const [statsResult, byProgramResult, monthlyResult, streakResult, memberResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as "totalCheckIns",
          COUNT(DISTINCT DATE("checkInTime")) as "uniqueDays",
          MIN("checkInTime") as "firstCheckIn",
          MAX("checkInTime") as "lastCheckIn"
        FROM check_ins
        WHERE "memberId" = $1
      `, [memberId]),

      pool.query(`
        SELECT e."programType", COUNT(*) as count
        FROM check_ins ci
        JOIN events e ON ci."eventId" = e.id
        WHERE ci."memberId" = $1 AND e."programType" IS NOT NULL
        GROUP BY e."programType"
      `, [memberId]),

      pool.query(`
        SELECT
          TO_CHAR("checkInTime", 'YYYY-MM') as month,
          COUNT(*) as count
        FROM check_ins
        WHERE "memberId" = $1
          AND "checkInTime" >= NOW() - INTERVAL '12 months'
        GROUP BY TO_CHAR("checkInTime", 'YYYY-MM')
        ORDER BY month DESC
      `, [memberId]),

      pool.query(`SELECT "attendanceStreak" FROM members WHERE id = $1`, [memberId]),
      pool.query(`SELECT ranking, "lastPromotionAt" FROM members WHERE id = $1`, [memberId]),
    ]);

    let classesSincePromotion = 0;
    const member = memberResult.rows[0];
    if (member) {
      const promotionResult = await pool.query(`
        SELECT COUNT(*) as count FROM check_ins
        WHERE "memberId" = $1
          AND ($2::timestamptz IS NULL OR "checkInTime" > $2)
      `, [memberId, member.lastPromotionAt || null]);
      classesSincePromotion = parseInt(promotionResult.rows[0]?.count) || 0;
    }

    res.json({
      stats: statsResult.rows[0],
      byProgram: byProgramResult.rows.reduce((acc: any, row: any) => {
        acc[row.programType] = row.count;
        return acc;
      }, {}),
      monthlyAttendance: monthlyResult.rows,
      currentStreak: streakResult.rows[0]?.attendanceStreak || 0,
      classesSincePromotion
    });
  } catch (error) {
    console.error('Error fetching member attendance:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Get belt progression status for a member
router.get('/belt-progress/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    const memberResult = await pool.query(`
      SELECT id, "firstName", "lastName", "programType", ranking, "lastPromotionAt",
             "totalClassesAttended", "lastCheckInAt"
      FROM members WHERE id = $1
    `, [memberId]);

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const member = memberResult.rows[0];

    const requirementsResult = await pool.query(`
      SELECT * FROM belt_requirements
      WHERE "programType" = $1 AND "fromRanking" = $2
    `, [member.programType, member.ranking]);

    const requirements = requirementsResult.rows[0] || null;

    let classesSincePromotion = 0;
    if (member.lastPromotionAt) {
      const result = await pool.query(`
        SELECT COUNT(*) as count FROM check_ins
        WHERE "memberId" = $1 AND "checkInTime" > $2
      `, [memberId, member.lastPromotionAt]);
      classesSincePromotion = parseInt(result.rows[0]?.count) || 0;
    } else {
      classesSincePromotion = member.totalClassesAttended || 0;
    }

    let timeInRank = 0;
    if (member.lastPromotionAt) {
      const promotionDate = new Date(member.lastPromotionAt);
      timeInRank = Math.floor((Date.now() - promotionDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    let skillsProgress = { learned: 0, required: 0, skills: [] as any[] };
    if (requirements?.requiredSkillCategories) {
      try {
        const requiredCategories = JSON.parse(requirements.requiredSkillCategories);
        const placeholders = requiredCategories.map((_: any, i: number) => `$${i + 2}`).join(',');
        const learnedSkills = await pool.query(`
          SELECT cs."skillCategory", msl."proficiencyLevel", cs."skillName"
          FROM member_skills_learned msl
          JOIN class_skills cs ON msl."skillId" = cs.id
          WHERE msl."memberId" = $1
            AND cs."skillCategory" IN (${placeholders})
            AND msl."proficiencyLevel" = 'proficient'
        `, [memberId, ...requiredCategories]);

        skillsProgress = {
          learned: learnedSkills.rows.length,
          required: requiredCategories.length * 5,
          skills: learnedSkills.rows
        };
      } catch (e) {
        // JSON parse error, ignore
      }
    }

    const classProgress = requirements
      ? Math.min(100, Math.round((classesSincePromotion / requirements.minClassAttendance) * 100))
      : 0;
    const timeProgress = requirements
      ? Math.min(100, Math.round((timeInRank / requirements.minTimeInRankDays) * 100))
      : 0;

    const readyForPromotion = requirements &&
      classesSincePromotion >= requirements.minClassAttendance &&
      timeInRank >= requirements.minTimeInRankDays;

    res.json({
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        programType: member.programType,
        currentRanking: member.ranking,
        lastPromotionAt: member.lastPromotionAt,
        totalClassesAttended: member.totalClassesAttended
      },
      requirements,
      progress: { classesSincePromotion, classProgress, timeInRank, timeProgress, skillsProgress },
      readyForPromotion,
      nextRanking: requirements?.toRanking || null
    });
  } catch (error) {
    console.error('Error fetching belt progress:', error);
    res.status(500).json({ error: 'Failed to fetch belt progress' });
  }
});

// Get skills learned by a member
router.get('/skills/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    const result = await pool.query(`
      SELECT msl.*, cs."skillName", cs."skillCategory", cs."programType", cs."beltLevel", cs.description,
             e.name as "eventName", e."startDateTime" as "learnedInClass"
      FROM member_skills_learned msl
      JOIN class_skills cs ON msl."skillId" = cs.id
      LEFT JOIN events e ON msl."eventId" = e.id
      WHERE msl."memberId" = $1
      ORDER BY msl."learnedAt" DESC
    `, [memberId]);

    const skills = result.rows;
    const byCategory = skills.reduce((acc: any, skill: any) => {
      if (!acc[skill.skillCategory]) acc[skill.skillCategory] = [];
      acc[skill.skillCategory].push(skill);
      return acc;
    }, {});

    res.json({ skills, byCategory, totalSkills: skills.length });
  } catch (error) {
    console.error('Error fetching member skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Record skills taught in a class
router.post('/event/:eventId/skills', async (req: AuthRequest, res) => {
  try {
    const { eventId } = req.params;
    const { skills } = req.body;

    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({ error: 'Skills array is required' });
    }

    const eventResult = await pool.query('SELECT "programType" FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const programType = eventResult.rows[0].programType;
    const createdSkills = [];

    for (const skill of skills) {
      const existing = await pool.query(
        'SELECT id FROM class_skills WHERE "eventId" = $1 AND "skillName" = $2',
        [eventId, skill.skillName]
      );

      if (existing.rows.length === 0) {
        const result = await pool.query(`
          INSERT INTO class_skills ("eventId", "skillName", "skillCategory", "programType", "beltLevel", description, "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          RETURNING id
        `, [eventId, skill.skillName, skill.skillCategory, programType, skill.beltLevel || null, skill.description || null]);

        createdSkills.push({ id: result.rows[0].id, ...skill });
      }
    }

    res.json({
      success: true,
      createdSkills,
      message: `${createdSkills.length} skills recorded for class`
    });
  } catch (error) {
    console.error('Error recording class skills:', error);
    res.status(500).json({ error: 'Failed to record skills' });
  }
});

// Mark a skill as learned by a member
router.post('/skills/learn', async (req: AuthRequest, res) => {
  try {
    const { memberId, skillId, eventId, proficiencyLevel = 'introduced', instructorNotes } = req.body;

    if (!memberId || !skillId) {
      return res.status(400).json({ error: 'Member ID and Skill ID are required' });
    }

    const existing = await pool.query(
      'SELECT id, "proficiencyLevel" FROM member_skills_learned WHERE "memberId" = $1 AND "skillId" = $2',
      [memberId, skillId]
    );

    if (existing.rows.length > 0) {
      const levels = ['introduced', 'practiced', 'proficient'];
      if (levels.indexOf(proficiencyLevel) > levels.indexOf(existing.rows[0].proficiencyLevel)) {
        await pool.query(`
          UPDATE member_skills_learned
          SET "proficiencyLevel" = $1, "instructorNotes" = COALESCE($2, "instructorNotes"), "learnedAt" = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [proficiencyLevel, instructorNotes, existing.rows[0].id]);
      }
      return res.json({ success: true, updated: true, message: 'Skill proficiency updated' });
    }

    const result = await pool.query(`
      INSERT INTO member_skills_learned ("memberId", "skillId", "eventId", "proficiencyLevel", "instructorNotes", "learnedAt")
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      RETURNING id
    `, [memberId, skillId, eventId || null, proficiencyLevel, instructorNotes || null]);

    res.json({ success: true, id: result.rows[0].id, message: 'Skill recorded for member' });
  } catch (error) {
    console.error('Error recording skill:', error);
    res.status(500).json({ error: 'Failed to record skill' });
  }
});

// Get all belt requirements
router.get('/belt-requirements', async (req: AuthRequest, res) => {
  try {
    const { programType } = req.query;

    let sql = 'SELECT * FROM belt_requirements';
    const params: any[] = [];

    if (programType) {
      params.push(programType);
      sql += ` WHERE "programType" = $1`;
    }

    sql += ' ORDER BY "programType", id';

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching belt requirements:', error);
    res.status(500).json({ error: 'Failed to fetch requirements' });
  }
});

// Record a promotion
router.post('/promote/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const { newRanking } = req.body;

    if (!newRanking) {
      return res.status(400).json({ error: 'New ranking is required' });
    }

    const memberResult = await pool.query('SELECT ranking, "programType" FROM members WHERE id = $1', [memberId]);
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    await pool.query(`
      UPDATE members
      SET ranking = $1, "lastPromotionAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newRanking, memberId]);

    res.json({
      success: true,
      previousRanking: memberResult.rows[0].ranking,
      newRanking,
      message: `Member promoted to ${newRanking}`
    });
  } catch (error) {
    console.error('Error recording promotion:', error);
    res.status(500).json({ error: 'Failed to record promotion' });
  }
});

// Get attendance calendar data for a member
router.get('/calendar/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;
    const { year, month } = req.query;

    const yearNum = parseInt(year as string) || new Date().getFullYear();
    const monthNum = parseInt(month as string) || new Date().getMonth() + 1;

    const result = await pool.query(`
      SELECT ci.*, e.name as "eventName", e."programType", l.name as "locationName"
      FROM check_ins ci
      LEFT JOIN events e ON ci."eventId" = e.id
      LEFT JOIN locations l ON ci."locationId" = l.id
      WHERE ci."memberId" = $1
        AND EXTRACT(YEAR FROM ci."checkInTime") = $2
        AND EXTRACT(MONTH FROM ci."checkInTime") = $3
      ORDER BY ci."checkInTime"
    `, [memberId, yearNum, monthNum]);

    const checkIns = result.rows;
    const byDate = checkIns.reduce((acc: any, checkIn: any) => {
      const date = new Date(checkIn.checkInTime).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(checkIn);
      return acc;
    }, {});

    res.json({
      year: yearNum,
      month: monthNum,
      checkIns,
      byDate,
      totalForMonth: checkIns.length
    });
  } catch (error) {
    console.error('Error fetching attendance calendar:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

export default router;
