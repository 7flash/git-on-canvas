import { measure } from 'measure-fn';
import { exec } from 'child_process';
import { promisify } from 'util';
import { blockInProduction } from '../validate-path';

const execAsync = promisify(exec);

export async function POST(req: Request) {
    const blocked = blockInProduction('Folder browser');
    if (blocked) return blocked;

    return measure('api:repo:browse', async () => {
        try {
            // Use PowerShell with -EncodedCommand to avoid quoting issues
            // Use TopMost Form to ensure the dialog pops up ABOVE the browser window
            const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Git Repository"
$dialog.ShowNewFolderButton = $false

$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$result = $dialog.ShowDialog($form)

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
} else {
    Write-Output ""
}
$form.Dispose()
`.trim();

            const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

            // Use async exec so we don't block the entire melina server (which freezes the UI's live updates)
            const { stdout } = await execAsync(
                `powershell -sta -WindowStyle Hidden -NoProfile -EncodedCommand ${encoded}`,
                { encoding: 'utf-8', timeout: 86400000 }
            );

            const selected = stdout.trim();

            if (!selected) {
                return Response.json({ cancelled: true, path: null });
            }

            return Response.json({ cancelled: false, path: selected });
        } catch (error: any) {
            console.error('api:repo:browse:error', error);
            // Even if cancelled or errored, don't crash the server. Let UI reset the dropdown.
            return Response.json({ cancelled: true, path: null, error: error.message });
        }
    });
}
