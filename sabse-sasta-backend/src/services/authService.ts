import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { RegisterRequest, LoginRequest, JWTPayload } from '../types';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { EmailService } from './emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export class AuthService {
  static async register(data: RegisterRequest) {
    const { email, password, fullName, phone, userType = 'customer' } = data;

    // Validate required fields
    if (!email || !password || !fullName) {
      throw new Error('Email, password, and full name are required');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if user already exists
      const existingUserResult = await client.query(
        'SELECT user_id FROM users WHERE email = $1',
        [email]
      );

      if (existingUserResult.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new Error('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, name, user_type)
         VALUES ($1, $2, $3, $4)
         RETURNING user_id, email, name, user_type`,
        [email, hashedPassword, fullName, userType]
      );

      const user = userResult.rows[0];

      // If user is a vendor, create vendor profile
      if (userType === 'vendor') {
        await client.query(
          `INSERT INTO vendors (user_id, vendor_name, contact_email, is_verified, is_approved)
           VALUES ($1, $2, $3, true, false)`,
          [user.user_id, fullName || email, email]
        );
      }

      await client.query('COMMIT');

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.user_id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        user: {
          id: user.user_id,
          email: user.email,
          name: user.name,
          phone: null,
          role: user.user_type,
        },
        token,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      // Log the FULL error to see what's actually happening
      console.error('Full registration error:', error);
      console.error('Error code:', error.code);
      console.error('Error constraint:', error.constraint);
      
      if (error.code === '23505') { // PostgreSQL unique violation
        throw new Error('User with this email already exists');
      }
      
      throw error;
    } finally {
      client.release();
    }
  }

  static async login(data: LoginRequest) {
    const { email, password } = data;

    // Find user
    const result = await pool.query(
      'SELECT user_id, email, password_hash, name, user_type FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      user: {
        id: user.user_id,
        email: user.email,
        name: user.name,
        phone: null,
        role: user.user_type,
      },
      token,
    };
  }

  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static async googleAuth(idToken: string, userType: 'customer' | 'vendor' = 'customer') {
    const client = await pool.connect();
    try {
      // Verify Google token
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Invalid Google token');
      }

      const { email, name, picture } = payload;

      if (!email) {
        throw new Error('Email not provided by Google');
      }

      await client.query('BEGIN');

      // Check if user already exists
      let userResult = await client.query(
        'SELECT user_id, email, name, user_type FROM users WHERE email = $1',
        [email]
      );

      let user = userResult.rows[0];

      // If user doesn't exist, create them
      if (!user) {
        const newUserResult = await client.query(
          `INSERT INTO users (email, password_hash, name, user_type)
           VALUES ($1, $2, $3, $4)
           RETURNING user_id, email, name, user_type`,
          [email, '', name || email.split('@')[0], userType]
        );

        user = newUserResult.rows[0];

        // If user is a vendor, create vendor profile
        if (userType === 'vendor') {
          await client.query(
            `INSERT INTO vendors (user_id, vendor_name, contact_email, is_verified, is_approved)
             VALUES ($1, $2, $3, true, false)`,
            [user.user_id, name || email.split('@')[0], email]
          );
        }
      }

      await client.query('COMMIT');

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.user_id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        user: {
          id: user.user_id,
          email: user.email,
          name: user.name,
          phone: null,
          role: user.user_type,
        },
        token,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw new Error(`Google authentication failed: ${error.message}`);
    } finally {
      client.release();
    }
  }

  static async requestPasswordReset(email: string) {
    // Find user (do not reveal existence in responses)
    const result = await pool.query(
      'SELECT user_id, name FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    // Always respond with success to avoid user enumeration
    if (!user) {
      // Don't reveal if user exists or not
      return { message: 'If the email exists, a new password has been sent.' };
    }

    // Generate new random password (8 characters: letters + numbers)
    const newPassword = crypto.randomBytes(4).toString('hex'); // Generates 8 character password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password in database
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2',
      [hashedPassword, user.user_id]
    );
    
    // Log new password to console for development
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 NEW PASSWORD GENERATED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Email: ${email}`);
    console.log(`User: ${user.name}`);
    console.log(`New Password: ${newPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Send email with new password (will fail silently if SMTP not configured)
    try {
      console.log('📧 Attempting to send email...');
      const emailSent = await EmailService.sendNewPasswordEmail(email, newPassword, user.name || undefined);
      if (emailSent) {
        console.log('✅ Email sent successfully!');
      } else {
        console.log('❌ Email sending returned false');
      }
    } catch (error: any) {
      console.log('⚠️ Email sending failed:', error.message);
      console.log('Use the password above to login.');
    }

    return { message: 'If the email exists, a new password has been sent.' };
  }

  static async resetPassword(token: string, newPassword: string) {
    const now = new Date();

    const resetResult = await pool.query(
      'SELECT reset_id, user_id, used, expires_at FROM password_resets WHERE token = $1',
      [token]
    );

    const reset = resetResult.rows[0];

    if (!reset || reset.used || reset.expires_at < now) {
      throw new Error('Invalid or expired password reset token');
    }

    const userResult = await pool.query(
      'SELECT user_id FROM users WHERE user_id = $1',
      [reset.user_id]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2',
      [hashed, reset.user_id]
    );

    await pool.query(
      'UPDATE password_resets SET used = true WHERE reset_id = $1',
      [reset.reset_id]
    );

    return { message: 'Password has been reset successfully' };
  }
}