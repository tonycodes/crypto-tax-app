import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { CreateUserRequest, LoginRequest, User, JWTPayload, AuthResponse } from './types';

// In-memory store for development/testing (will be replaced with Prisma)
const users: User[] = [];

export class AuthService {
  private readonly jwtSecret: string;
  private readonly saltRounds: number = 12;

  constructor() {
    this.jwtSecret = process.env['JWT_SECRET'] || 'fallback-secret-for-tests';
  }

  async register(userData: CreateUserRequest): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = users.find(user => user.email === userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, this.saltRounds);

    // Create user
    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      email: userData.email,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    users.push(newUser);

    // Generate JWT token
    const token = this.generateToken({
      userId: newUser.id,
      email: newUser.email,
    });

    return {
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
      },
      token,
    };
  }

  async login(loginData: LoginRequest): Promise<AuthResponse> {
    // Find user by email
    const user = users.find(u => u.email === loginData.email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginData.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Generate JWT token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
    });

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
      },
      token,
    };
  }

  async getUserById(userId: string): Promise<User | null> {
    return users.find(user => user.id === userId) || null;
  }

  generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '24h',
    });
  }

  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Clear users for testing
  clearUsers(): void {
    users.length = 0;
  }
}