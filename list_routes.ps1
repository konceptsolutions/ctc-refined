$content = Get-Content "C:\Users\Ksol\.vscode\projects\ctc-refined\backend\src\routes\sales.ts"
$results = @()
for ($i=0; $i -lt $content.Length; $i++) {
    if ($content[$i] -match "^router\.") {
        $results += "$($i+1): $($content[$i])"
    }
}
$results | Out-File "C:\Users\Ksol\.vscode\projects\ctc-refined\routes_list.txt" -Encoding utf8
