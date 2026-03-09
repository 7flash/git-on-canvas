/**
 * Client-side auth — fetches user session, manages login/logout UI, favorites
 */

interface UserData {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string;
}

let currentUser: UserData | null = null;
let userFavorites: { repoUrl: string; repoName: string }[] = [];

/** Initialize auth UI — call once on page load */
export async function setupAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (data.authenticated && data.user) {
            currentUser = data.user;
            userFavorites = data.favorites || [];
            showLoggedIn(data.user);
        } else {
            showLoggedOut();
        }
    } catch {
        showLoggedOut();
    }

    // Wire up logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/me', { method: 'POST' });
                currentUser = null;
                userFavorites = [];
                showLoggedOut();
            } catch { }
        });
    }

    // Wire up favorite toggle
    const favBtn = document.getElementById('favToggle');
    if (favBtn) {
        favBtn.addEventListener('click', toggleFavorite);
    }
}

function showLoggedIn(user: UserData) {
    const loggedOut = document.getElementById('userLoggedOut');
    const loggedIn = document.getElementById('userLoggedIn');
    const avatar = document.getElementById('userAvatar') as HTMLImageElement;
    const name = document.getElementById('userName');

    if (loggedOut) loggedOut.style.display = 'none';
    if (loggedIn) loggedIn.style.display = 'flex';
    if (avatar) avatar.src = user.avatarUrl;
    if (name) name.textContent = user.displayName || user.username;
}

function showLoggedOut() {
    const loggedOut = document.getElementById('userLoggedOut');
    const loggedIn = document.getElementById('userLoggedIn');

    if (loggedOut) loggedOut.style.display = '';
    if (loggedIn) loggedIn.style.display = 'none';
}

/** Update the favorite star for the currently loaded repo */
export function updateFavoriteStar(repoUrl?: string) {
    const favBtn = document.getElementById('favToggle');
    if (!favBtn || !currentUser) return;

    const url = repoUrl || getCurrentRepoUrl();
    if (!url) {
        favBtn.style.display = 'none';
        return;
    }

    favBtn.style.display = '';
    const isFav = userFavorites.some(f => f.repoUrl === url);
    favBtn.classList.toggle('favorited', isFav);
}

async function toggleFavorite() {
    if (!currentUser) return;

    const repoUrl = getCurrentRepoUrl();
    if (!repoUrl) return;

    const isFav = userFavorites.some(f => f.repoUrl === repoUrl);
    const action = isFav ? 'remove' : 'add';
    const repoName = document.querySelector('.commit-hash-label')?.textContent || '';

    try {
        const res = await fetch('/api/auth/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, repoUrl, repoName }),
        });

        const data = await res.json();
        if (data.ok) {
            if (action === 'add') {
                userFavorites.push({ repoUrl, repoName });
            } else {
                userFavorites = userFavorites.filter(f => f.repoUrl !== repoUrl);
            }
            updateFavoriteStar(repoUrl);
        }
    } catch { }
}

function getCurrentRepoUrl(): string {
    // Get from hash (e.g. #C:\Code\project or #https://github.com/user/repo)
    const hash = location.hash.slice(1);
    if (hash) return hash;

    return '';
}

/** Get the current user for other modules */
export function getUser() {
    return currentUser;
}

/** Get user favorites list */
export function getFavorites() {
    return userFavorites;
}
