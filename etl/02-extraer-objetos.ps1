<#
  Fase 1 (b) - Re-export de formularios, informes, macros y modulos.
  extracted_source/ los tenia con codificacion doble y el VBA truncado.
  SaveAsText via COM produce el texto integro en UTF-16, que aqui se
  normaliza a UTF-8 sin BOM.
#>
$ErrorActionPreference = 'Stop'
$raiz    = Split-Path -Parent $PSScriptRoot
$origen  = Join-Path $raiz 'origen\diarioDeCampo.accdb'
$destino = Join-Path $raiz 'etl\salida\objetos'
$tmp     = Join-Path $env:TEMP 'ddc_objetos'

foreach ($d in 'formularios','informes','macros','modulos','consultas') {
  New-Item -ItemType Directory -Force (Join-Path $destino $d) | Out-Null
}
New-Item -ItemType Directory -Force $tmp | Out-Null

# el .accdb esta en solo lectura: Access necesita escribir, se usa una copia
$copia = Join-Path $tmp 'trabajo.accdb'
Copy-Item $origen $copia -Force
Set-ItemProperty $copia -Name IsReadOnly -Value $false

# SaveAsText escribe UTF-16LE para formularios, informes y macros, pero UTF-8
# para los modulos VBA. Asumir una sola codificacion es justo el fallo que
# dejo extracted_source/ ilegible y con el VBA aparentemente truncado.
function Read-TextoAuto([string]$ruta) {
  $b = [System.IO.File]::ReadAllBytes($ruta)
  if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) {
    return [System.Text.Encoding]::Unicode.GetString($b, 2, $b.Length - 2)
  }
  if ($b.Length -ge 4 -and $b[1] -eq 0 -and $b[3] -eq 0) {
    return [System.Text.Encoding]::Unicode.GetString($b)
  }
  $sinBom = if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { 3 } else { 0 }
  return [System.Text.Encoding]::UTF8.GetString($b, $sinBom, $b.Length - $sinBom)
}

$acObjeto = @{ formularios = 2; informes = 3; macros = 4; modulos = 5 }   # acForm/acReport/acMacro/acModule

$app = New-Object -ComObject Access.Application
try {
  $app.Visible = $false
  $app.OpenCurrentDatabase($copia)
  $proy = $app.CurrentProject
  $db   = $app.CurrentDb()

  $grupos = @{
    formularios = $proy.AllForms
    informes    = $proy.AllReports
    macros      = $proy.AllMacros
    modulos     = $proy.AllModules
  }

  foreach ($g in $grupos.Keys) {
    foreach ($o in $grupos[$g]) {
      $salidaTmp = Join-Path $tmp "$($o.Name).txt"
      $app.SaveAsText($acObjeto[$g], $o.Name, $salidaTmp)
      $texto = Read-TextoAuto $salidaTmp
      $final = Join-Path $destino "$g\$($o.Name).txt"
      [System.IO.File]::WriteAllText($final, $texto, (New-Object System.Text.UTF8Encoding($false)))
      Remove-Item $salidaTmp -Force
      Write-Host ("[{0,-11}] {1,-34} {2,7} car." -f $g, $o.Name, $texto.Length)
    }
  }

  # consultas: el SQL crudo, incluidas las ocultas de formularios
  foreach ($q in $db.QueryDefs) {
    if ($q.Name -like '~*') { continue }
    $seguro = ($q.Name -replace '[\/:*?"<>|]', '_')
    [System.IO.File]::WriteAllText((Join-Path $destino "consultas\$seguro.sql"), $q.SQL,
                                   (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ("[consultas  ] {0,-34} tipo {1}" -f $q.Name, $q.Type)
  }
}
finally {
  try { $app.CloseCurrentDatabase() } catch {}
  try { $app.Quit(2) } catch {}          # acQuitSaveNone
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host ""
Write-Host "[ok] objetos re-exportados en UTF-8 e integros" -ForegroundColor Green
