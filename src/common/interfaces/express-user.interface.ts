import { Role, User } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
}

export function mapUser(user: Pick<User, 'id' | 'email' | 'role' | 'name'>): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
}
