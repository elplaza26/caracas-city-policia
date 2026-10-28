# PRIME POLICE · Panel administrativo

Panel privado de gestión de personal de PRIME POLICE, orientado a UCOP y RR. HH. La interfaz está publicada en GitHub Pages y usa Supabase Edge Functions para validar el acceso, guardar los registros y sincronizar acciones autorizadas con Discord.

## Módulos

- **Postulaciones:** formulario modal privado, registro de nombre/edad IC y edad OOC, revisión desde la web, aceptación o rechazo y asignación del rol de Preselección.
- **Solicitudes de rango:** revisión de las solicitudes enviadas por el personal desde Discord.
- **Preseleccionados:** base independiente para personas aceptadas que todavía no han ingresado en la Policía.
- **Personal de Policía:** fichas con nombre IC/OOC, placa, usuario de Discord, rango, unidad y estado; búsqueda, filtros y expediente individual.
- **Ascensos y descensos:** configuración de la escala a partir de roles de Discord, cambios de rango, motivo e historial de auditoría.
- **Sanciones:** registro de Warn y Strike, motivo y evidencia, publicación en sus canales, sincronización de roles e historial. El tercer Strike asigna Expulsado y retira Policía; no expulsa del servidor.

## Acceso y datos

El inicio de sesión se hace con Discord. Solo pueden entrar integrantes que tengan al menos uno de los roles gestores configurados en `prime-police-panel/index.ts` y `prime-police-panel/hr.ts`. Las funciones validan la sesión y los roles en el servidor antes de cada operación. Las tablas usan RLS y las funciones acceden a ellas con la clave privada de servicio.

No guardes tokens de Discord, claves de Supabase ni la clave `service_role` en `index.html`, GitHub o mensajes. Configúralos en los secretos de Supabase:

- `DISCORD_BOT_TOKEN`
- `DISCORD_OAUTH_CLIENT_SECRET`

Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a las Edge Functions. El identificador de aplicación Discord, roles, canales y proyecto de Supabase están configurados en el código; revísalos antes de reutilizar este repositorio en otro servidor.

## Despliegue

- **Panel:** <https://primepolicerp.github.io/PRIME-POLICE/>
- **Proyecto Supabase:** `ngkmylqsdeevdtrjrgfn`
- **Interacciones del bot:** `https://ngkmylqsdeevdtrjrgfn.supabase.co/functions/v1/prime-police-discord`
- **Retorno OAuth de Discord:** `https://ngkmylqsdeevdtrjrgfn.supabase.co/functions/v1/prime-police-panel?panel=oauth-callback`

GitHub Pages publica la rama `main` con `.github/workflows/pages.yml`. El backend está formado por `prime-police-panel` (panel y RR. HH.) y `prime-police-discord` (comandos e interacciones). Las tablas y cambios de esquema están versionados en `supabase/migrations/`; antes de desplegar una instalación nueva, aplica todas las migraciones en orden en el proyecto Supabase.

Los rangos se configuran dentro del panel: abre **Ascensos y descensos**, añade los roles de rango del servidor en el orden jerárquico y guarda la escala. No importes todos los roles sin revisar cuáles pertenecen realmente a la escala policial.

## Archivos principales

- `index.html`: interfaz del panel.
- `supabase/functions/prime-police-panel/index.ts`: acceso, postulaciones, decisiones y sanciones.
- Solicitudes de traslado: formulario privado en el canal `1564900830077788190`, revisión en la pestaña **Traslados** y asignación del rol `1564907324638888017` al aceptar. El rol permite coordinar una entrevista IC; no añade automáticamente el rol de Policía.
- `supabase/functions/prime-police-panel/hr.ts`: personal, solicitudes de rango, jerarquía e historial.
- `supabase/functions/prime-police-discord/index.ts`: comandos e interacciones de Discord.
- `supabase/migrations/`: esquema de postulaciones, preseleccionados, personal, rangos, solicitudes e historial.

## Autorización de ascensos

Directiva incluye Gobierno/Alta Directiva `1539970134565982313`, Directiva `1539970134544748562` y Directiva `1539970134519578774`. Puede aplicar ascensos directamente y revisar propuestas. Otros gestores conservan la gestión habitual; un ascenso requiere revisión de Directiva. Editar Personal aplica la misma regla. Una asignación inicial por encima del primer rango también requiere autorización. La escala de rangos la modifica Directiva.

Las propuestas se revisan en Ascensos y descensos → Autorizaciones de Directiva. Una aprobación comprueba que el rango actual sigue siendo el de la propuesta y vuelve a validar los permisos del revisor. Las operaciones simultáneas para un agente se protegen mediante una reserva con caducidad. Si una propuesta queda en procesamiento tras un corte, revisar Discord y la ficha antes de cualquier reparación manual.

La migración `20261028194311_police_rank_authorizations.sql` añade las autorizaciones, reservas, auditoría y el resumen de horas por período. El historial horario se consulta por fechas y páginas de 50 registros. Los permisos de gestión se verifican de nuevo en cada operación; las consultas comparten una caché de roles de 10 segundos.
