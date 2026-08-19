#!/usr/bin/env node
/**
 * Fase 3 (b) - Sube a R2 los 8 adjuntos que Access guardaba en campos
 * Attachment. Las claves coinciden con adjuntos.r2_key de D1.
 *
 *   node etl/04-subir-adjuntos.mjs            # bucket local (wrangler dev)
 *   node etl/04-subir-adjuntos.mjs --remote   # bucket de Cloudflare
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ADJUNTOS = join(RAIZ, 'etl', 'salida', 'adjuntos');
const API = join(RAIZ, 'api');
const BUCKET = 'diariodecampo-adjuntos';
const remoto = process.argv.includes('--remote');

const manifiesto = JSON.parse(readFileSync(join(ADJUNTOS, 'manifiesto.json'), 'utf8'));
const lista = Array.isArray(manifiesto) ? manifiesto : [manifiesto];

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };

let subidos = 0;
for (const a of lista) {
  const archivo = join(ADJUNTOS, a.archivo_local);
  if (!existsSync(archivo)) {
    console.error(`  [falta] ${a.archivo_local} - ejecuta antes etl/01-extraer.ps1`);
    process.exitCode = 1;
    continue;
  }
  const clave = `adjuntos/${a.tabla}/${a.registro_id}/${a.nombre_archivo}`;
  const tipo = MIME[a.nombre_archivo.split('.').pop().toLowerCase()] ?? 'application/octet-stream';

  execFileSync('npx', [
    'wrangler', 'r2', 'object', 'put', `${BUCKET}/${clave}`,
    `--file=${archivo}`, `--content-type=${tipo}`,
    remoto ? '--remote' : '--local',
  ], { cwd: API, stdio: 'pipe', shell: process.platform === 'win32' });

  console.log(`  [ok] ${clave}  ${a.bytes} bytes`);
  subidos++;
}

console.log(`\n${subidos}/${lista.length} adjuntos en el bucket ${remoto ? 'remoto' : 'local'}`);
