import { measure } from 'measure-fn';
import { validateRepoPath } from '../validate-path';
import * as path from 'path';
import * as fs from 'fs';

export async function POST(req: Request) {
    return measure('api:repo:file-save', async () => {
        try {
            const { path: repoPath, filePath, content } = await req.json();

            if (!repoPath || !filePath || content === undefined) {
                return new Response('Repository path, file path, and content are required', { status: 400 });
            }

            const blocked = validateRepoPath(repoPath);
            if (blocked) return blocked;

            // Resolve absolute path and ensure it's within the repo
            const absPath = path.resolve(repoPath, filePath);
            const absRepo = path.resolve(repoPath);
            if (!absPath.startsWith(absRepo)) {
                return new Response('File path must be within the repository', { status: 403 });
            }

            // Ensure directory exists
            const dir = path.dirname(absPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Write file
            fs.writeFileSync(absPath, content, 'utf-8');

            return Response.json({
                success: true,
                path: filePath,
                bytes: Buffer.byteLength(content, 'utf-8'),
                lines: content.split('\n').length,
            });
        } catch (error: any) {
            console.error('api:repo:file-save:error', error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
