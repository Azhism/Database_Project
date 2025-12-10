import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { RegisterRequest, LoginRequest } from '../types';
import pool from '../config/database';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const data: RegisterRequest = req.body;
    console.log('Registration request:', { email: data.email, userType: data.userType, hasPassword: !!data.password, hasFullName: !!data.fullName });
    const result = await AuthService.register(data);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Registration error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const data: LoginRequest = req.body;
    console.log('Login attempt for email:', data.email);
    const result = await AuthService.login(data);
    console.log('Login successful for:', data.email);
    res.json(result);
  } catch (error: any) {
    console.error('Login error:', error.message);
    console.error('Full error:', error);
    res.status(401).json({ error: error.message });
  }
});

router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken, userType = 'customer' } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const result = await AuthService.googleAuth(idToken, userType);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

router.post('/request-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    console.log('🔄 Password reset requested for:', email);
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const result = await AuthService.requestPasswordReset(email);
    console.log('✅ Password reset completed for:', email);
    res.json(result);
  } catch (error: any) {
    console.error('❌ Password reset error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and newPassword are required' });

    const result = await AuthService.resetPassword(token, newPassword);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Verify current user's token
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = AuthService.verifyToken(token);
    
    // Get user details from database
    const result = await pool.query(
      'SELECT user_id, email, name, user_type FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.user_id,
        email: user.email,
        name: user.name,
        role: user.user_type,
      }
    });
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export default router;

