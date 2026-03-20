import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query, get, run } from '../models/database';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get attendance summary for a member
router.get('/member/:memberId', async (req: AuthRequest, res) => {
  try {
    const { memberId } = req.params;

    // Get overall attendance stats
    const stats = await get(`
      SELECT
        COUNT(*) as totalCheckIns,
        COUNT(DISTINCT DATE(checkInTime)) as uniqueDays,
        MIN(checkInTime) as firstCheckIn,
        MAX(checkInTime) as lastCheckIn
      FROM check_ins
      WHERE memberId = ?
    `, [memberId]);

    // Get attendance by program type (from events)
    const byProgram = await query(`
      SELECT e.programType, COUNT(*) as count
      FROM check_ins ci
      JOIN events e ON ci.eventId = e.id
      WHERE ci.memberId = ? AND e.programType IS NOT NULL
      GROUP BY e.programType
    `, [memberId]);

    // Get monthly attendance (last 12 months)
    const monthly = await query(`
      SELECT
        strftime('%Y-%m', checkInTime) as month,
        COUNT(*) as count
      FROM check_ins
      WHERE memberId = ?
        AND checkInTime >= DATE('now', '-12 months')
      GROUP BY strftime('%Y-%m', checkInTime)
      ORDER BY month DESC
    `, [memberId]);

    // Get current streak
    const streakResult = await get(`
      SELECT attendanceStreak FROM members WHERE id = ?
    `, [memberId]);

    // Get classes since last promotion
    const member = await get(`
      SELECT ranking, lastPromotionAt FROM members WHERE id = ?
    `, [memberId]);

    let classesSincePromotion = 0;
    if (member) {
      const promotionResult = await get(`
        SELECT COUNT(*) as count FROM check_ins
        WHERE memberId = ?
          AND (? IS NULL OR checkInTime > ?)
      `, [memberId, member.lastPromotionAt, member.lastPromotionAt]);
      classesSincePromotion = promotionResult?.count || 0;
    }

    res.json({
      stats,
      byProgram: byProgram.reduce((acc: any, row: any) => {
        acc[row.programType] = row.count;
        return acc;
      }, {}),
      monthlyAttendance: monthly,
      currentStreak: streakResult?.attendanceStreak || 0,
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

    // Get member's current ranking and program
    const member = await get(`
      SELECT id, firstName, lastName, programType, ranking, lastPromotionAt,
             totalClassesAttended, lastCheckInAt
      FROM members WHERE id = ?
    `, [memberId]);

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Get belt requirements for next rank
    const requirements = await get(`
      SELECT * FROM belt_requirements
      WHERE programType = ? AND fromRanking = ?
    `, [member.programType, member.ranking]);

    // Calculate classes since last promotion
    let classesSincePromotion = 0;
    if (member.lastPromotionAt) {
      const result = await get(`
        SELECT COUNT(*) as count FROM check_ins
        WHERE memberId = ? AND checkInTime > ?
      `, [memberId, member.lastPromotionAt]);
      classesSincePromotion = result?.count || 0;
    } else {
      classesSincePromotion = member.totalClassesAttended || 0;
    }

    // Calculate time in current rank (days)
    let timeInRank = 0;
    if (member.lastPromotionAt) {
      const promotionDate = new Date(member.lastPromotionAt);
      const now = new Date();
      timeInRank = Math.floor((now.getTime() - promotionDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Get required skills learned
    let skillsProgress = { learned: 0, required: 0, skills: [] as any[] };
    if (requirements?.requiredSkillCategories) {
      try {
        const requiredCategories = JSON.parse(requirements.requiredSkillCategories);

        // Get skills learned in required categories
        const learnedSkills = await query(`
          SELECT cs.skillCategory, msl.proficiencyLevel, cs.skillName
          FROM member_skills_learned msl
          JOIN class_skills cs ON msl.skillId = cs.id
          WHERE msl.memberId = ?
            AND cs.skillCategory IN (${requiredCategories.map(() => '?').join(',')})
            AND msl.proficiencyLevel = 'proficient'
        `, [memberId, ...requiredCategories]);

        skillsProgress = {
          learned: learnedSkills.length,
          required: requiredCategories.length * 5, // Assume 5 skills per category
          skills: learnedSkills
        };
      } catch (e) {
        // JSON parse error, ignore
      }
    }

    // Calculate progress percentages
    const classProgress = requirements ?
      Math.min(100, Math.round((classesSincePromotion / requirements.minClassAttendance) * 100)) : 0;
    const timeProgress = requirements ?
      Math.min(100, Math.round((timeInRank / requirements.minTimeInRankDays) * 100)) : 0;

    // Check if ready for promotion
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
      progress: {
        classesSincePromotion,
        classProgress,
        timeInRank,
        timeProgress,
        skillsProgress
      },
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

    const skills = await query(`
      SELECT msl.*, cs.skillName, cs.skillCategory, cs.programType, cs.beltLevel, cs.description,
             e.name as eventName, e.startDateTime as learnedInClass
      FROM member_skills_learned msl
      JOIN class_skills cs ON msl.skillId = cs.id
      LEFT JOIN events e ON msl.eventId = e.id
      ORDER BY msl.learnedAt DESC
    `, [memberId]);

    // Group by category
    const byCategory = skills.reduce((acc: any, skill: any) => {
      if (!acc[skill.skillCategory]) {
        acc[skill.skillCategory] = [];
      }
      acc[skill.skillCategory].push(skill);
      return acc;
    }, {});

    res.json({
      skills,
      byCategory,
      totalSkills: skills.length
    });
  } catch (error) {
    console.error('Error fetching member skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Record skills taught in a class
router.post('/event/:eventId/skills', async (req: AuthRequest, res) => {
  try {
    const { eventId } = req.params;
    const { skills } = req.body; // Array of { skillName, skillCategory, description }

    if (!skills || !Array.isArray(skills)) {
      return res.status(400).json({ error: 'Skills array is required' });
    }

    // Get event details for program type
    const event = await get('SELECT programType FROM events WHERE id = ?', [eventId]);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const createdSkills = [];

    for (const skill of skills) {
      // Check if skill already exists for this event
      const existing = await get(
        'SELECT id FROM class_skills WHERE eventId = ? AND skillName = ?',
        [eventId, skill.skillName]
      );

      if (!existing) {
        const result = await run(`
          INSERT INTO class_skills (eventId, skillName, skillCategory, programType, beltLevel, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [eventId, skill.skillName, skill.skillCategory, event.programType, skill.beltLevel || null, skill.description || null]);

        createdSkills.push({ id: result.id, ...skill });
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

    // Check if already learned (update proficiency if so)
    const existing = await get(
      'SELECT id, proficiencyLevel FROM member_skills_learned WHERE memberId = ? AND skillId = ?',
      [memberId, skillId]
    );

    if (existing) {
      // Only update if new proficiency is higher
      const levels = ['introduced', 'practiced', 'proficient'];
      if (levels.indexOf(proficiencyLevel) > levels.indexOf(existing.proficiencyLevel)) {
        await run(`
          UPDATE member_skills_learned
          SET proficiencyLevel = ?, instructorNotes = COALESCE(?, instructorNotes), learnedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [proficiencyLevel, instructorNotes, existing.id]);
      }

      return res.json({
        success: true,
        updated: true,
        message: 'Skill proficiency updated'
      });
    }

    // Insert new skill record
    const result = await run(`
      INSERT INTO member_skills_learned (memberId, skillId, eventId, proficiencyLevel, instructorNotes, learnedAt)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [memberId, skillId, eventId || null, proficiencyLevel, instructorNotes || null]);

    res.json({
      success: true,
      id: result.id,
      message: 'Skill recorded for member'
    });
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
      sql += ' WHERE programType = ?';
      params.push(programType);
    }

    sql += ' ORDER BY programType, id';

    const requirements = await query(sql, params);
    res.json(requirements);
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

    // Get current member info
    const member = await get('SELECT ranking, programType FROM members WHERE id = ?', [memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Update member's ranking
    await run(`
      UPDATE members
      SET ranking = ?, lastPromotionAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newRanking, memberId]);

    // Log the promotion (could create a promotions table for history)
    console.log(`Member ${memberId} promoted from ${member.ranking} to ${newRanking}`);

    res.json({
      success: true,
      previousRanking: member.ranking,
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

    // Get all check-ins for the specified month
    const checkIns = await query(`
      SELECT ci.*, e.name as eventName, e.programType, l.name as locationName
      FROM check_ins ci
      LEFT JOIN events e ON ci.eventId = e.id
      LEFT JOIN locations l ON ci.locationId = l.id
      WHERE ci.memberId = ?
        AND strftime('%Y', ci.checkInTime) = ?
        AND strftime('%m', ci.checkInTime) = ?
      ORDER BY ci.checkInTime
    `, [memberId, yearNum.toString(), monthNum.toString().padStart(2, '0')]);

    // Group by date
    const byDate = checkIns.reduce((acc: any, checkIn: any) => {
      const date = checkIn.checkInTime.split('T')[0];
      if (!acc[date]) {
        acc[date] = [];
      }
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
