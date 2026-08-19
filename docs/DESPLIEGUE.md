# Despliegue en Cloudflare (fase 8)

Todo lo anterior corre en local con `wrangler dev`, sobre el mismo esquema y
el mismo código que correrán en la nube. Pasar a producción es un despliegue,
no una segunda migración.

Lo que sigue **no está hecho**: requiere una cuenta de Cloudflare y decidir
quién entra al sistema.

## 1. Crear los recursos

```bash
cd api
npx wrangler login

npx wrangler d1 create diariodecampo
# copia el database_id que imprime y pégalo en api/wrangler.toml,
# donde ahora pone PENDIENTE-crear-con-wrangler-d1-create-diariodecampo

npx wrangler r2 bucket create diariodecampo-adjuntos
```

## 2. Llevar el esquema y los datos

```bash
cd api
npm run migrar:nube            # aplica db/migrations/ sobre D1
npm run sembrar:nube           # carga etl/salida/seed.sql
node ../etl/04-subir-adjuntos.mjs --remote   # las 8 fotos a R2
```

Comprobación: la API debe contestar lo mismo que en local.

```bash
npx wrangler d1 execute diariodecampo --remote \
  --command "SELECT COUNT(*) FROM actividades"     # 157
```

## 3. Publicar

```bash
cd api  && npm run deploy      # el Worker
cd ../web && npm run build     # deja dist/web/browser
npx wrangler pages deploy ../web/dist/web/browser --project-name=diariodecampo
```

El frontend llama a `/api`, así que en producción hay que servir ambos bajo el
mismo dominio. Dos opciones:

- **Ruta en el Worker** (recomendado): añadir al Worker un `assets` binding que
  sirva `dist/web/browser`, y así todo vive en un único despliegue.
- **Pages + regla de reescritura**: publicar el frontend en Pages y enrutar
  `/api/*` al Worker desde el panel de Cloudflare.

## 4. Autenticación

**El sistema no tiene ninguna hoy, igual que Access.** En local no importa; en
internet sí. Antes de exponerlo hace falta decidirlo.

Lo más rápido para una finca con pocas personas es **Cloudflare Access**:
se protege el dominio entero, se da de alta a cada persona por correo, y ni el
Worker ni Angular necesitan código de sesión. La aplicación queda detrás del
inicio de sesión sin tocar una línea.

Si más adelante hacen falta permisos distintos por persona (por ejemplo, que
quien registra cosechas no pueda borrar cultivos), eso sí exige trabajo: una
tabla de usuarios, un rol por usuario y comprobaciones en cada endpoint.

## 5. Copias de seguridad

```bash
node etl/07-respaldo.mjs copia --remote    # deja un .sql en db/copias/
node etl/07-respaldo.mjs ensayo            # respalda, restaura y compara
```

El ensayo **ya se ha probado en local** y la base sale idéntica, tabla por
tabla. Conviene programarlo: un respaldo que nadie ha restaurado nunca no es
un respaldo, es un archivo.

Cloudflare mantiene además su propio *time travel* de D1, que permite volver a
un punto de los últimos 30 días. No sustituye a tener copias fuera de
Cloudflare.

## 6. Antes de dar por buena la puesta en marcha

- [ ] `database_id` real en `api/wrangler.toml`
- [ ] Recuento de filas en la nube igual al de local
- [ ] Los 8 adjuntos se abren desde la aplicación publicada
- [ ] Autenticación activa
- [ ] Una copia de seguridad restaurada de principio a fin
- [ ] Fecha de corte acordada: cuándo se deja de usar Access

## Coste

Con 354 filas y 1,4 MB de adjuntos, el uso cabe holgadamente en el plan
gratuito de Workers, D1 y R2. El gasto aparecería con volúmenes que esta finca
no va a alcanzar en años.
