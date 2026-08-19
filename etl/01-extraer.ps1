<#
  Fase 1 - Re-extraccion fiel de diarioDeCampo.accdb
  Corrige los cuatro defectos de extracted_source/:
    1. codificacion doble  -> JSON UTF-8 real
    2. VBA truncado        -> re-export por COM (SaveAsText)
    3. sin PK/FK/indices   -> volcado de esquemas OLE DB
    4. adjuntos perdidos   -> extraccion binaria a disco
#>
$ErrorActionPreference = 'Stop'
$raiz    = Split-Path -Parent $PSScriptRoot
$origen  = Join-Path $raiz 'origen\diarioDeCampo.accdb'
$destino = Join-Path $raiz 'etl\salida'
$hashEsperado = (Get-Content (Join-Path $raiz 'origen\SHA256.txt') -Raw).Split(' ')[0].Trim()

# --- 0. el origen no se ha movido -------------------------------------------
$hashActual = (Get-FileHash $origen -Algorithm SHA256).Hash.ToLower()
if ($hashActual -ne $hashEsperado.ToLower()) {
  throw "El .accdb ha cambiado. Esperado $hashEsperado, encontrado $hashActual"
}
Write-Host "[ok] hash del origen verificado" -ForegroundColor Green

foreach ($d in 'datos','esquema','adjuntos','objetos') {
  New-Item -ItemType Directory -Force (Join-Path $destino $d) | Out-Null
}

$cs = "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$origen;"
$cn = New-Object System.Data.OleDb.OleDbConnection($cs)
$cn.Open()

function Get-Tabla([string]$sql) {
  $a = New-Object System.Data.OleDb.OleDbDataAdapter($sql, $cn)
  $t = New-Object System.Data.DataTable
  [void]$a.Fill($t)
  return ,$t
}

function Write-Json($objeto, [string]$ruta) {
  $json = $objeto | ConvertTo-Json -Depth 8
  if ($null -eq $json) { $json = '[]' }
  [System.IO.File]::WriteAllText($ruta, $json, (New-Object System.Text.UTF8Encoding($false)))
}

# --- 1. tablas de usuario ----------------------------------------------------
$tablas = @('actividades','ciudad','clientes','cosecha','costosInsumos','costosMO',
            'detallePedido','empleados','infoSemilla','inventarioProductos',
            'pedido','productos','programacionCultivos')

# los campos Attachment no se pueden leer como columna normal: se excluyen aqui
# y se extraen aparte en el paso 3.
$adjuntoDe = @{
  clientes    = @{ campo='Carpeta'; clave='NitCedula' }
  empleados   = @{ campo='archivo'; clave='id' }
  infoSemilla = @{ campo='Archivo'; clave='Id' }
  productos   = @{ campo='archivo'; clave='id' }
}

$conteos = @()
foreach ($t in $tablas) {
  $cols = Get-Tabla "SELECT * FROM [$t] WHERE 1=0"
  $nombres = @()
  foreach ($c in $cols.Columns) {
    if ($adjuntoDe.ContainsKey($t) -and $c.ColumnName -eq $adjuntoDe[$t].campo) { continue }
    $nombres += "[$($c.ColumnName)]"
  }
  $dt = Get-Tabla ("SELECT " + ($nombres -join ', ') + " FROM [$t]")

  $filas = @()
  foreach ($r in $dt.Rows) {
    $o = [ordered]@{}
    foreach ($c in $dt.Columns) {
      $v = $r[$c.ColumnName]
      if ($v -is [System.DBNull]) { $o[$c.ColumnName] = $null }
      elseif ($v -is [datetime]) {
        # ISO-8601; sin hora cuando es medianoche exacta
        $o[$c.ColumnName] = if ($v.TimeOfDay.Ticks -eq 0) { $v.ToString('yyyy-MM-dd') }
                            else { $v.ToString('yyyy-MM-ddTHH:mm:ss') }
      }
      elseif ($v -is [bool]) { $o[$c.ColumnName] = $v }
      else { $o[$c.ColumnName] = $v }
    }
    $filas += [pscustomobject]$o
  }
  Write-Json $filas (Join-Path $destino "datos\$t.json")
  $conteos += [pscustomobject]@{ tabla=$t; filas=$dt.Rows.Count; columnas=$dt.Columns.Count }
  Write-Host ("[datos]   {0,-22} {1,4} filas" -f $t, $dt.Rows.Count)
}
Write-Json $conteos (Join-Path $destino 'esquema\conteos.json')

# --- 2. metadatos de esquema (lo que faltaba por completo) -------------------
$G = [System.Data.OleDb.OleDbSchemaGuid]
function Esquema($guid, [string]$archivo, [string[]]$campos) {
  $tb = $cn.GetOleDbSchemaTable($guid, $null)
  $f = $tb | Where-Object { $_.TABLE_NAME -notlike 'MSys*' -and $_.TABLE_NAME -notlike '~*' }
  Write-Json ($f | Select-Object $campos) (Join-Path $destino "esquema\$archivo")
  Write-Host ("[esquema] {0,-22} {1,4} registros" -f $archivo, @($f).Count)
}
Esquema $G::Primary_Keys 'claves_primarias.json' @('TABLE_NAME','COLUMN_NAME','ORDINAL')
Esquema $G::Indexes       'indices.json'          @('TABLE_NAME','INDEX_NAME','COLUMN_NAME','UNIQUE','PRIMARY_KEY','ORDINAL_POSITION')
Esquema $G::Columns       'columnas.json'         @('TABLE_NAME','COLUMN_NAME','ORDINAL_POSITION','DATA_TYPE','IS_NULLABLE','COLUMN_HASDEFAULT','COLUMN_DEFAULT','CHARACTER_MAXIMUM_LENGTH')

$fk = $cn.GetOleDbSchemaTable($G::Foreign_Keys, $null) |
      Where-Object { $_.FK_TABLE_NAME -notlike 'MSys*' }
Write-Json ($fk | Select-Object PK_TABLE_NAME,PK_COLUMN_NAME,FK_TABLE_NAME,FK_COLUMN_NAME,UPDATE_RULE,DELETE_RULE) `
           (Join-Path $destino 'esquema\claves_foraneas.json')
Write-Host ("[esquema] {0,-22} {1,4} registros" -f 'claves_foraneas.json', @($fk).Count)

# --- 3. adjuntos ------------------------------------------------------------
# Los campos Attachment de Access llevan una cabecera interna propia y pueden ir
# comprimidos. Leer FileData por OLE DB devuelve ese envoltorio, no el archivo.
# DAO expone SaveToFile, que es la unica via que reconstruye el original.
$manifiesto = @()
$dbe = New-Object -ComObject DAO.DBEngine.120
$db  = $dbe.OpenDatabase($origen, $false, $true)   # exclusivo=no, solo lectura=si
try {
  foreach ($t in $adjuntoDe.Keys) {
    $campo = $adjuntoDe[$t].campo
    $clave = $adjuntoDe[$t].clave
    $rs = $db.OpenRecordset("SELECT [$clave], [$campo] FROM [$t]")
    while (-not $rs.EOF) {
      $k = $rs.Fields($clave).Value
      $hijo = $rs.Fields($campo).Value          # Recordset2 de adjuntos
      while (-not $hijo.EOF) {
        $nombre = $hijo.Fields('FileName').Value
        $ruta = Join-Path $destino "adjuntos\${t}_${k}_$nombre"
        if (Test-Path $ruta) { Remove-Item $ruta -Force }
        $hijo.Fields('FileData').SaveToFile($ruta)
        $len = (Get-Item $ruta).Length
        $manifiesto += [pscustomobject]@{
          tabla = $t; registro_id = [string]$k; nombre_archivo = $nombre
          bytes = $len; archivo_local = (Split-Path $ruta -Leaf)
          sha256 = (Get-FileHash $ruta -Algorithm SHA256).Hash.ToLower()
        }
        Write-Host ("[adjunto] {0,-14} {1,-10} {2,-24} {3,7} bytes" -f $t, $k, $nombre, $len)
        $hijo.MoveNext()
      }
      $hijo.Close()
      $rs.MoveNext()
    }
    $rs.Close()
  }
} finally {
  $db.Close()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($dbe)
}
Write-Json $manifiesto (Join-Path $destino 'adjuntos\manifiesto.json')

$cn.Close()
Write-Host ""
Write-Host "[ok] extraccion de datos, esquema y adjuntos completa" -ForegroundColor Green
