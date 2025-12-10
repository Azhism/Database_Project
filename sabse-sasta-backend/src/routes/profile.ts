import { Router, Response } from 'express';
import pool from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT user_id, email, name, user_type FROM users WHERE user_id = $1',
      [parseInt(req.userId as string)]
    );
    
    const user = result.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.user_id,
      email: user.email,
      fullName: user.name,
      phone: null,
      role: user.user_type || 'customer',
    });
  } catch (error: any) {
    console.error('Profile route error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const { fullName, phone } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name)
       WHERE user_id = $2
       RETURNING user_id, email, name, user_type`,
      [fullName || null, parseInt(req.userId as string)]
    );

    const user = result.rows[0];

    res.json({
      id: user.user_id,
      email: user.email,
      fullName: user.name,
      phone: null,
      role: user.user_type || 'customer',
    });
  } catch (error: any) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

