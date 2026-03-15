import { measure } from "measure-fn";
import simpleGit from "simple-git";
import { readFileSync } from "fs";
import path from "path";
import { validateRepoPath } from "../validate-path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

export async function POST(req: Request) {
  return measure("api:repo:file-content", async () => {
    try {
      const { path: repoPath, commit, filePath } = await req.json();

      if (!repoPath || !commit || !filePath) {
        return new Response(
          "Repository path, commit, and file path are required",
          { status: 400 },
        );
      }

      const blocked = validateRepoPath(repoPath);
      if (blocked) return blocked;

      const git = simpleGit(repoPath);
      const content = await git.show([`${commit}:${filePath}`]);

      return Response.json({ content });
    } catch (error: any) {
      console.error("api:repo:file-content:error", error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  });
}

export async function GET(req: Request) {
  return measure("api:repo:file-image", async () => {
    try {
      const url = new URL(req.url);
      const repoPath = url.searchParams.get("path");
      const file = url.searchParams.get("file");

      if (!repoPath || !file) {
        return new Response("Repository path and file are required", {
          status: 400,
        });
      }

      const blocked = validateRepoPath(repoPath);
      if (blocked) return blocked;

      const ext = path.extname(file).toLowerCase();
      const mimeType = MIME_TYPES[ext];

      if (!mimeType) {
        return new Response("Not an image file", { status: 400 });
      }

      const fullPath = path.join(repoPath, file);
      const buffer = readFileSync(fullPath);

      return new Response(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000",
        },
      });
    } catch (error: any) {
      console.error("api:repo:file-image:error", error);
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  });
}
