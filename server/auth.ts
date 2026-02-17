import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export type UserRole = "admin" | "user";

interface DemoUser {
  username: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
}

const JWT_SECRET = process.env.JWT_SECRET ?? "spatial-asset-register-dev-secret";

// Passwords:
// admin -> adminPassword
// user  -> userPassword
const demoUsers: DemoUser[] = [
  {
    username: "admin",
    displayName: "Maggie Huang",
    role: "admin",
    passwordHash: "$2a$10$hyohvuGo3defjGNCe9pece1jeu9SZpRGa4hjdZGWLyiI6emzlAEza"
  },
  {
    username: "user",
    displayName: "Guest User",
    role: "user",
    passwordHash: "$2a$10$r9tviMXsCNzYouRuAStFSOFJrWVBRwQf1iuvm5viS33Pd4Rr2ls1."
  }
];

export async function validateCredentials(username: string, password: string): Promise<{ username: string; displayName: string; role: UserRole } | null> {
  const account = demoUsers.find((u) => u.username === username);
  if (!account) return null;
  const ok = await bcrypt.compare(password, account.passwordHash);
  if (!ok) return null;
  return { username: account.username, displayName: account.displayName, role: account.role };
}

export function issueToken(username: string, role: UserRole): string {
  return jwt.sign({ sub: username, role }, JWT_SECRET, { expiresIn: "8h" });
}

export function verifyToken(token: string): { username: string; role: UserRole } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; role: UserRole };
    return { username: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
