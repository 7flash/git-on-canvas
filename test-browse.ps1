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
    Write-Output "CANCELLED"
}
$form.Dispose()
