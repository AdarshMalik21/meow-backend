import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AuthUser = {
  userId: string;
  phone: string;
};

export type AuthedRequest = Request & { user?: AuthUser };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please log in again.' });
  }

  const token = header.slice(7);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server is not set up correctly.' });
    }
    const payload = jwt.verify(token, secret) as AuthUser;
    req.user = { userId: payload.userId, phone: payload.phone };
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please log in again.' });
  }
}

export function signToken(user: AuthUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET missing');
  }
  return jwt.sign(user, secret, { expiresIn: '30d' });
}
