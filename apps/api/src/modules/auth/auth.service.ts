import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import { conflict, unauthorized, validationError } from '@kantorku/shared';
import type { AppConfig } from '../../config.js';

type Db = any;

export async function hashPassword(password: string, rounds: number): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(
  db: Db,
  config: AppConfig,
  input: { email: string; password: string; name: string },
) {
  const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length > 0) {
    throw conflict('Email already registered');
  }

  const passwordHash = await hashPassword(input.password, config.BCRYPT_ROUNDS);

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash,
      name: input.name,
    })
    .returning({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt });

  return user;
}

export async function authenticateUser(
  db: Db,
  input: { email: string; password: string },
) {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user) {
    throw unauthorized('Invalid email or password');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw unauthorized('Invalid email or password');
  }

  return { id: user.id, email: user.email, name: user.name };
}

export async function getUserById(db: Db, id: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    throw validationError('User not found');
  }

  return user;
}
