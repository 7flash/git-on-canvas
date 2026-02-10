import { measure } from '../../../lib/measure.js';
import simpleGit from 'simple-git';
import path from 'path';

export async function POST(req) {
    return measure('api:repo:load', async () => {
        try {
            const { path: repoPath } = await req.json();

            if (!repoPath) {
                return new Response('Repository path is required', { status: 400 });
            }

            const git = simpleGit(repoPath);

            // Check if it's a git repository
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                return new Response('Not a valid git repository', { status: 400 });
            }

            // Get commit log (last 100 commits)
            const log = await git.log({ maxCount: 100 });

            const commits = log.all.map(commit => ({
                hash: commit.hash,
                message: commit.message.split('\n')[0], // First line only
                author: commit.author_name,
                email: commit.author_email,
                date: commit.date
            }));

            return Response.json({ commits });
        } catch (error) {
            measure('api:repo:load:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
