<#
  Fase 7 (a) - Vuelca el resultado de las 9 consultas SELECT de Access.

  Se ejecutan contra el .accdb congelado, con el motor de Access, y se
  guardan tal cual para poder compararlas fila a fila con lo que devuelve
  D1. Se usa DAO porque cProgramacionCultivo lleva un parametro que Access
  pide al usuario y OLE DB no permite rellenar.

  Salida: etl/salida/paridad/<consulta>.json
#>
$ErrorActionPreference = 'Stop'
$raiz    = Split-Path -Parent $PSScriptRoot
$origen  = Join-Path $raiz 'origen\diarioDeCampo.accdb'
$destino = Join-Path $raiz 'etl\salida\paridad'
New-Item -ItemType Directory -Force $destino | Out-Null

# hoy, en la zona del negocio. Access usa la fecha del equipo, que es la misma.
$hoy = (Get-Date).ToString('yyyy-MM-dd')
$fechaInicial = [datetime]'1900-01-01'

# Consultas SELECT del origen. Las de accion no se vuelcan: ya se validaron
# con el oraculo independiente de api/test/paridad-consultas.mjs.
$consultas = @(
  'ActualizarAbonamiento',
  'cCostosActividades',
  'cCostosInsumos',
  'cInventarioCampo',
  'cInventarioProductos',
  'cosecha Consulta',
  'cProgramacionSiembra',
  'cProgramacionCultivosAbonamiento',
  'cProgramacionCultivo'
)

$dbe = New-Object -ComObject DAO.DBEngine.120
$db  = $dbe.OpenDatabase($origen, $false, $true)
$resumen = @()

try {
  foreach ($nombre in $consultas) {
    $qd = $db.QueryDefs($nombre)

    # rellenar los parametros que Access pediria por pantalla
    foreach ($p in $qd.Parameters) {
      switch -Wildcard ($p.Name) {
        '*fechaInicial*' { $p.Value = $fechaInicial }
        default          { $p.Value = $null }
      }
    }

    try {
      $rs = $qd.OpenRecordset(4)          # dbOpenSnapshot
    } catch {
      Write-Host ("[error]  {0,-34} {1}" -f $nombre, $_.Exception.Message) -ForegroundColor Red
      $resumen += [pscustomobject]@{ consulta=$nombre; filas=-1; error=$_.Exception.Message }
      continue
    }

    $columnas = @()
    foreach ($f in $rs.Fields) { $columnas += $f.Name }

    $filas = @()
    while (-not $rs.EOF) {
      $o = [ordered]@{}
      for ($i = 0; $i -lt $rs.Fields.Count; $i++) {
        $f = $rs.Fields.Item($i)
        # los nombres repetidos de Access se desambiguan con un sufijo
        $clave = $f.Name
        $n = 2
        while ($o.Contains($clave)) { $clave = "$($f.Name)__$n"; $n++ }

        $v = $f.Value
        if ($null -eq $v -or $v -is [System.DBNull]) { $o[$clave] = $null }
        elseif ($v -is [datetime]) {
          $o[$clave] = if ($v.TimeOfDay.Ticks -eq 0) { $v.ToString('yyyy-MM-dd') }
                       else { $v.ToString('yyyy-MM-ddTHH:mm:ss') }
        }
        elseif ($v -is [bool]) { $o[$clave] = [int]$v }     # Access: True = -1
        else { $o[$clave] = $v }
      }
      $filas += [pscustomobject]$o
      $rs.MoveNext()
    }
    $rs.Close()

    $seguro = ($nombre -replace '[\\/:*?"<>|]', '_')
    $json = if ($filas.Count -eq 0) { '[]' }
            elseif ($filas.Count -eq 1) { '[' + ($filas[0] | ConvertTo-Json -Depth 6) + ']' }
            else { $filas | ConvertTo-Json -Depth 6 }
    [System.IO.File]::WriteAllText((Join-Path $destino "$seguro.json"), $json,
                                   (New-Object System.Text.UTF8Encoding($false)))

    Write-Host ("[ok]     {0,-34} {1,4} filas, {2,2} columnas" -f $nombre, $filas.Count, $columnas.Count)
    $resumen += [pscustomobject]@{ consulta=$nombre; filas=$filas.Count; columnas=$columnas.Count; error=$null }
  }
}
finally {
  $db.Close()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($dbe)
}

$meta = [pscustomobject]@{ generado=(Get-Date).ToString('s'); hoy=$hoy; fechaInicial=$fechaInicial.ToString('yyyy-MM-dd'); consultas=$resumen }
[System.IO.File]::WriteAllText((Join-Path $destino '_meta.json'),
  ($meta | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "[ok] volcado de Access completo en etl/salida/paridad/" -ForegroundColor Green
