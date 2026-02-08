import { measure } from '../../../lib/measure.js';
import { execSync } from 'child_process';

export async function POST(req) {
    return measure('api:repo:browse', async () => {
        try {
            // Use PowerShell to open native folder picker on Windows
            const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Git Repository"
$dialog.ShowNewFolderButton = $false
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
} else {
    Write-Output ""
}
`.trim().replace(/\n/g, '; ');

            const selected = execSync(
                `powershell -NoProfile -Command "${psScript}"`,
                { encoding: 'utf-8', timeout: 60000 }
            ).trim();

            if (!selected) {
                return Response.json({ cancelled: true, path: null });
            }

            return Response.json({ cancelled: false, path: selected });
        } catch (error) {
            measure('api:repo:browse:error', () => error);
            return new Response(`Error: ${error.message}`, { status: 500 });
        }
    });
}
