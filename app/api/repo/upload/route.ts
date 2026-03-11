import { mkdir, writeFile } from "fs/promises";
import * as path from "path";
import { $ } from "bun";

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return Response.json({ error: 'No files provided' }, { status: 400 });
        }

        // Generate a unique ID for this upload
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const repoPath = path.resolve(`.data/uploads/${uploadId}`);

        // Ensure directories exist
        await mkdir(repoPath, { recursive: true });

        // Write all files
        for (const file of files) {
            const relativePath = file.name; // We passed the full path in formData.append('files', f, f.fullPath)
            if (relativePath.includes('..') || relativePath.includes('\0')) {
                continue; // Basic security prevention
            }
            const fullPath = path.join(repoPath, relativePath);
            await mkdir(path.dirname(fullPath), { recursive: true });

            const buffer = Buffer.from(await file.arrayBuffer());
            await writeFile(fullPath, buffer);
        }

        // Initialize a Git repository so galaxy-canvas can read it
        await $`git init`.cwd(repoPath);

        // Setup dummy user info, otherwise git commits will fail if not globally set
        await $`git config user.name "Galaxy Canvas"`.cwd(repoPath);
        await $`git config user.email "bot@galaxycanvas.local"`.cwd(repoPath);

        // Add all files and commit
        await $`git add .`.cwd(repoPath);
        await $`git commit -m "Initial drop imported by drag-and-drop"`.cwd(repoPath);

        return Response.json({ path: repoPath, success: true });
    } catch (e: any) {
        console.error("Upload error:", e);
        return Response.json({ error: e.message || 'Failed to upload files' }, { status: 500 });
    }
}
