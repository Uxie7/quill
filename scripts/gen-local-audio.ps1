param()

Add-Type -AssemblyName System.Speech

$demoDir = Join-Path $PSScriptRoot "..\demo_recordings"
if (-not (Test-Path $demoDir)) {
    New-Item -ItemType Directory -Path $demoDir | Out-Null
}

$scriptsDir = Join-Path $PSScriptRoot "..\data\scripts"
$scripts = Get-ChildItem -Path $scriptsDir -Filter "*.json"

foreach ($file in $scripts) {
    $data = Get-Content $file.FullName -Raw | ConvertFrom-Json
    $clientId = $data.client
    $outFile = Join-Path $demoDir "$clientId`_call_recording.wav"

    Write-Host "Generating 2-person dialogue audio for $clientId -> $outFile"

    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.SetOutputToWaveFile($outFile)

    foreach ($line in $data.lines) {
        if ($line.speaker -eq "you") {
            $synth.SelectVoice("Microsoft David Desktop")
        } else {
            $synth.SelectVoice("Microsoft Zira Desktop")
        }
        $synth.Speak($line.text)
    }

    $synth.Dispose()
    Write-Host "Created: $outFile"
}
