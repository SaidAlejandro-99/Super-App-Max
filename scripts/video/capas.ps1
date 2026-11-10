# Convierte cada escena en capas PNG con Edge sin ventana: el fondo (#base) y cada elemento animado (#1, #2...) con transparencia.
param([string]$Work = (Join-Path $PSScriptRoot '..\..\informes\video'))
$Work = (Get-Item $Work).FullName
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
New-Item -ItemType Directory -Force "$Work\layers" | Out-Null
$meta = Get-Content "$Work\scenes\capas.json" -Raw | ConvertFrom-Json
foreach ($p in $meta.PSObject.Properties) {
  $id = $p.Name
  $url = 'file:///' + ("$Work\scenes\$id.html" -replace '\\', '/' -replace ' ', '%20')
  foreach ($L in @('base') + (1..@($p.Value).Count)) {
    # La ventana es más alta que 1080 porque Edge sin ventana recorta la parte de abajo; el armado corta a 1080.
    $a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--default-background-color=00000000',
      "`"--user-data-dir=$Work\edgeprof`"", '--window-size=1920,1144', '--virtual-time-budget=2500',
      "`"--screenshot=$Work\layers\$id-$L.png`"", "$url#$L")
    Start-Process $edge -ArgumentList $a -Wait -NoNewWindow 2>$null | Out-Null
  }
}
"$((Get-ChildItem "$Work\layers\*.png").Count) capas"
