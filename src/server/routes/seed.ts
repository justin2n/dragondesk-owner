import { Router } from 'express';
import { pool } from '../models/database';
import { authenticateToken, authorizeAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// ONE-TIME seed endpoint — remove after use
router.post('/demo-members', authenticateToken, authorizeAdmin, async (req: AuthRequest, res) => {
  const members = [
    { firstName: 'Carlos', lastName: 'Mendez', email: 'carlos.mendez@example.com', phone: '555-101-0001', accountStatus: 'member', accountType: 'premium', programType: 'BJJ', membershipAge: 'Adult', ranking: 'Blue Belt', leadSource: 'Walk-in' },
    { firstName: 'Aisha', lastName: 'Thompson', email: 'aisha.thompson@example.com', phone: '555-101-0002', accountStatus: 'member', accountType: 'elite', programType: 'Muay Thai', membershipAge: 'Adult', ranking: 'Intermediate', leadSource: 'Instagram' },
    { firstName: 'Derek', lastName: 'Nguyen', email: 'derek.nguyen@example.com', phone: '555-101-0003', accountStatus: 'member', accountType: 'basic', programType: 'Taekwondo', membershipAge: 'Adult', ranking: 'Green Belt', leadSource: 'Referral' },
    { firstName: 'Sofia', lastName: 'Reyes', email: 'sofia.reyes@example.com', phone: '555-101-0004', accountStatus: 'trialer', accountType: 'basic', programType: 'BJJ', membershipAge: 'Adult', ranking: 'White Belt', leadSource: 'Google' },
    { firstName: 'Marcus', lastName: 'Williams', email: 'marcus.williams@example.com', phone: '555-101-0005', accountStatus: 'member', accountType: 'premium', programType: 'BJJ', membershipAge: 'Adult', ranking: 'Purple Belt', leadSource: 'Facebook' },
    { firstName: 'Lily', lastName: 'Chen', email: 'lily.chen@example.com', phone: '555-101-0006', accountStatus: 'member', accountType: 'basic', programType: 'Taekwondo', membershipAge: 'Kids', ranking: 'Yellow Belt', leadSource: 'Referral' },
    { firstName: 'Jordan', lastName: 'Baker', email: 'jordan.baker@example.com', phone: '555-101-0007', accountStatus: 'lead', accountType: 'basic', programType: 'Muay Thai', membershipAge: 'Adult', ranking: 'Beginner', leadSource: 'Website' },
    { firstName: 'Elena', lastName: 'Vasquez', email: 'elena.vasquez@example.com', phone: '555-101-0008', accountStatus: 'member', accountType: 'elite', programType: 'BJJ', membershipAge: 'Adult', ranking: 'Brown Belt', leadSource: 'Walk-in' },
    { firstName: 'Tyler', lastName: 'Scott', email: 'tyler.scott@example.com', phone: '555-101-0009', accountStatus: 'member', accountType: 'premium', programType: 'Muay Thai', membershipAge: 'Adult', ranking: 'Advanced', leadSource: 'Instagram' },
    { firstName: 'Priya', lastName: 'Patel', email: 'priya.patel@example.com', phone: '555-101-0010', accountStatus: 'trialer', accountType: 'basic', programType: 'Taekwondo', membershipAge: 'Adult', ranking: 'White Belt', leadSource: 'Google' },
    { firstName: 'Noah', lastName: 'Kim', email: 'noah.kim@example.com', phone: '555-101-0011', accountStatus: 'member', accountType: 'basic', programType: 'Taekwondo', membershipAge: 'Kids', ranking: 'Orange Belt', leadSource: 'Referral' },
    { firstName: 'Grace', lastName: 'Okonkwo', email: 'grace.okonkwo@example.com', phone: '555-101-0012', accountStatus: 'member', accountType: 'premium', programType: 'BJJ', membershipAge: 'Adult', ranking: 'Blue Belt', leadSource: 'Facebook' },
    { firstName: 'Ethan', lastName: 'Murphy', email: 'ethan.murphy@example.com', phone: '555-101-0013', accountStatus: 'lead', accountType: 'basic', programType: 'BJJ', membershipAge: 'Adult', ranking: 'White Belt', leadSource: 'Website' },
    { firstName: 'Mia', lastName: 'Hernandez', email: 'mia.hernandez@example.com', phone: '555-101-0014', accountStatus: 'member', accountType: 'family', programType: 'Taekwondo', membershipAge: 'Kids', ranking: 'Blue Belt', leadSource: 'Referral' },
    { firstName: 'James', lastName: 'Robinson', email: 'james.robinson@example.com', phone: '555-101-0015', accountStatus: 'member', accountType: 'elite', programType: 'Muay Thai', membershipAge: 'Adult', ranking: 'Advanced', leadSource: 'Walk-in' },
    { firstName: 'Zoe', lastName: 'Anderson', email: 'zoe.anderson@example.com', phone: '555-101-0016', accountStatus: 'trialer', accountType: 'basic', programType: 'BJJ', membershipAge: 'Adult', ranking: 'White Belt', leadSource: 'Instagram' },
    { firstName: 'Leo', lastName: 'Martínez', email: 'leo.martinez@example.com', phone: '555-101-0017', accountStatus: 'member', accountType: 'premium', programType: 'BJJ', membershipAge: 'Adult', ranking: 'Purple Belt', leadSource: 'Google' },
    { firstName: 'Ava', lastName: 'Davis', email: 'ava.davis@example.com', phone: '555-101-0018', accountStatus: 'member', accountType: 'basic', programType: 'Taekwondo', membershipAge: 'Kids', ranking: 'Red Belt', leadSource: 'Referral' },
    { firstName: 'Sam', lastName: 'Wilson', email: 'sam.wilson@example.com', phone: '555-101-0019', accountStatus: 'member', accountType: 'premium', programType: 'Muay Thai', membershipAge: 'Adult', ranking: 'Intermediate', leadSource: 'Facebook' },
    { firstName: 'Chloe', lastName: 'Taylor', email: 'chloe.taylor@example.com', phone: '555-101-0020', accountStatus: 'lead', accountType: 'basic', programType: 'Muay Thai', membershipAge: 'Adult', ranking: 'Beginner', leadSource: 'Website' },
  ];

  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const m of members) {
    try {
      await pool.query(`
        INSERT INTO members
          ("firstName","lastName",email,phone,"accountStatus","accountType","programType","membershipAge",ranking,"leadSource","memberStartDate","createdAt","updatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          NOW() - (RANDOM() * INTERVAL '24 months'),
          NOW() - (RANDOM() * INTERVAL '24 months'),
          NOW())
        ON CONFLICT (email) DO NOTHING
      `, [m.firstName, m.lastName, m.email, m.phone, m.accountStatus, m.accountType, m.programType, m.membershipAge, m.ranking, m.leadSource]);
      inserted.push(`${m.firstName} ${m.lastName}`);
    } catch {
      skipped.push(`${m.firstName} ${m.lastName}`);
    }
  }

  res.json({ inserted, skipped });
});

export default router;
