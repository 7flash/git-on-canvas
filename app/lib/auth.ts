/**
 * Galaxy Canvas — User Database & Session Management
 * 
 * SQLite-backed user accounts with GitHub OAuth.
 * Stores user profiles, favorites, and settings.
 */

import { Database, z } from 'sqlite-zod-orm';
import path from 'path';
import crypto from 'crypto';

// ─── Database ────────────────────────────────────────────────

const DB_PATH = path.join(import.meta.dir, '..', 'canvas_users.db');

export const db = new Database(DB_PATH, {
    users: z.object({
        githubId: z.string(),               // GitHub numeric ID (unique)
        username: z.string(),               // GitHub login
        displayName: z.string().default(''),
        avatarUrl: z.string().default(''),
        email: z.string().default(''),
        createdAt: z.string().default(() => new Date().toISOString()),
        lastLoginAt: z.string().default(() => new Date().toISOString()),
    }),
    sessions: z.object({
        token: z.string(),                  // Random session token (cookie)
        user_id: z.number(),                // FK to users
        expiresAt: z.string(),              // ISO timestamp
        createdAt: z.string().default(() => new Date().toISOString()),
    }),
    favorites: z.object({
        user_id: z.number(),                // FK to users
        repoUrl: z.string(),               // Git clone URL
        repoName: z.string().default(''),   // Display name
        addedAt: z.string().default(() => new Date().toISOString()),
    }),
    settings: z.object({
        user_id: z.number(),                // FK to users
        key: z.string(),                    // Setting key
        value: z.string(),                  // Setting value (JSON or string)
    }),
    repo_positions: z.object({
        user_id: z.number(),                // FK to users
        repoUrl: z.string(),               // Repository URL/path
        positionsJson: z.string().default('{}'), // JSON blob of all card positions
        updatedAt: z.string().default(() => new Date().toISOString()),
    }),
}, {
    relations: {
        sessions: { user_id: 'users' },
        favorites: { user_id: 'users' },
        settings: { user_id: 'users' },
        repo_positions: { user_id: 'users' },
    },
    indexes: {
        users: ['githubId', 'username'],
        sessions: ['token', 'user_id'],
        favorites: ['user_id', 'repoUrl'],
        settings: ['user_id', 'key'],
        repo_positions: ['user_id', 'repoUrl'],
    },
    reactive: false, // No need for reactivity
});

// ─── Session Helpers ─────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(userId: number): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.sessions.insert({ token, user_id: userId, expiresAt });
    return token;
}

export function getSessionUser(token: string) {
    if (!token) return null;
    const session = db.sessions.select().where({ token }).get();
    if (!session) return null;

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
        db.sessions.delete(session.id);
        return null;
    }

    const user = db.users.select().where({ id: session.user_id }).get();
    return user || null;
}

export function deleteSession(token: string): void {
    const session = db.sessions.select().where({ token }).get();
    if (session) db.sessions.delete(session.id);
}

// ─── User Helpers ────────────────────────────────────────────

export function findOrCreateUser(githubProfile: {
    id: string;
    login: string;
    name?: string;
    avatar_url?: string;
    email?: string;
}) {
    const existing = db.users.select().where({ githubId: githubProfile.id }).get();
    if (existing) {
        // Update last login and any changed profile data
        existing.update({
            lastLoginAt: new Date().toISOString(),
            username: githubProfile.login,
            displayName: githubProfile.name || existing.displayName,
            avatarUrl: githubProfile.avatar_url || existing.avatarUrl,
            email: githubProfile.email || existing.email,
        });
        return existing;
    }

    return db.users.insert({
        githubId: githubProfile.id,
        username: githubProfile.login,
        displayName: githubProfile.name || githubProfile.login,
        avatarUrl: githubProfile.avatar_url || '',
        email: githubProfile.email || '',
    });
}

// ─── Favorites Helpers ───────────────────────────────────────

export function addFavorite(userId: number, repoUrl: string, repoName?: string) {
    // Prevent duplicates
    const existing = db.favorites.select().where({ user_id: userId, repoUrl }).get();
    if (existing) return existing;
    return db.favorites.insert({ user_id: userId, repoUrl, repoName: repoName || '' });
}

export function removeFavorite(userId: number, repoUrl: string): boolean {
    const fav = db.favorites.select().where({ user_id: userId, repoUrl }).get();
    if (!fav) return false;
    db.favorites.delete(fav.id);
    return true;
}

export function getUserFavorites(userId: number) {
    return db.favorites.select().where({ user_id: userId }).orderBy('addedAt', 'desc').all();
}

// ─── Settings Helpers ────────────────────────────────────────

export function setSetting(userId: number, key: string, value: string) {
    return db.settings.upsert(
        { user_id: userId, key },
        { user_id: userId, key, value },
    );
}

export function getSetting(userId: number, key: string): string | null {
    const row = db.settings.select().where({ user_id: userId, key }).get();
    return row?.value || null;
}

export function getAllSettings(userId: number): Record<string, string> {
    const rows = db.settings.select().where({ user_id: userId }).all();
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
}

// ─── Position Sync Helpers ───────────────────────────────────

export function saveRepoPositions(userId: number, repoUrl: string, positionsJson: string) {
    return db.repo_positions.upsert(
        { user_id: userId, repoUrl },
        { user_id: userId, repoUrl, positionsJson, updatedAt: new Date().toISOString() },
    );
}

export function loadRepoPositions(userId: number, repoUrl: string): string | null {
    const row = db.repo_positions.select().where({ user_id: userId, repoUrl }).get();
    return row?.positionsJson || null;
}

// ─── Auth from Request ───────────────────────────────────────

export function getSessionFromRequest(req: Request) {
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/gc_session=([a-f0-9]+)/);
    return match ? getSessionUser(match[1]) : null;
}

export function sessionCookie(token: string, maxAge = 30 * 24 * 60 * 60): string {
    return `gc_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
