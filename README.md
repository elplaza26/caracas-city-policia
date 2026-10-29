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

En Bitácoras, Forzar cierre permite corregir la entrada e indicar la salida real en horario local (mismo día, día siguiente u otra fecha), o completar la salida con Cerrar ahora. Eliminar está disponible en turnos abiertos y completados; requiere motivo y conserva un respaldo privado del registro en la auditoría antes de retirarlo de los totales. UCOP y Directiva pueden cerrar y eliminar bitácoras directamente, con motivo y auditoría. Los demás gestores envían estas operaciones a Pendientes de Directiva. La migración `20261029131718_police_shift_admin_delete.sql` concede al servidor el permiso necesario para eliminar bitácoras; los clientes públicos siguen sin acceso a la tabla.

Al aceptar una postulación o un traslado, el panel asigna el rol correspondiente y pone el nombre IC de la solicitud como apodo de Discord, sin placa. El ingreso posterior como Policía sigue utilizando Nombre IC #placa. Si Discord impide cambiar el apodo (por ejemplo, al propietario del servidor), la aceptación se conserva y el panel muestra una advertencia. Este cambio se aplica a las nuevas aceptaciones; no modifica solicitudes antiguas automáticamente.

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

Directiva incluye Gobierno/Alta Directiva `1539970134565982313`, Directiva `1539970134544748562` y Directiva `1539970134519578774`. Puede aplicar ascensos directamente y revisar propuestas. UCOP y los demás gestores pueden preparar cualquier cambio desde la web; su propuesta no se aplica hasta que Directiva la aprueba. Esto incluye personal, ascensos, descensos, escala de rangos, sanciones, ingresos, postulaciones, traslados y apodos. Como excepción, UCOP puede cerrar y eliminar bitácoras directamente. Los botones de entrada y salida personales de Discord siguen registrando el servicio del agente.

Las nuevas propuestas se revisan en Panel principal → Cambios pendientes de Directiva. Hay pestañas de Pendientes e Historial con detalles y paginación. Los ascensos pendientes del sistema anterior también aparecen allí. Una aprobación comprueba que el rango actual sigue siendo el de la propuesta y vuelve a validar los permisos del revisor. Las operaciones simultáneas para un agente se protegen mediante una reserva con caducidad. Si una propuesta queda en procesamiento tras un corte, revisar Discord y la ficha antes de cualquier reparación manual.

La migración `20261028194311_police_rank_authorizations.sql` añade las autorizaciones, reservas, auditoría y el resumen de horas por período. El historial horario se consulta por fechas y páginas de 50 registros. Los permisos de gestión se verifican de nuevo en cada operación; las consultas comparten una caché de roles de 10 segundos.

La migración `20261028195820_police_all_changes_approval.sql` añade la bandeja general de cambios. La revisión comprueba el estado original de cada registro y bloquea propuestas obsoletas. Solo se admiten las operaciones enumeradas en `change-requests.ts`; nunca se ejecutan rutas arbitrarias del solicitante.

## Conexión y confirmación de operaciones

El panel comparte las consultas simultáneas a Discord, respeta sus respuestas de límite temporal y reintenta una vez las lecturas que fallen por conexión o errores del servicio. Los cambios no se repiten automáticamente tras un corte de red o un error incierto del servidor. La web conserva la sesión ante fallos temporales y muestra una referencia de petición para localizar el error. El chequeo público de conexión ya no registra ni consulta comandos de Discord en cada carga.

## Policía sin rama

La opción «Sin rama · Policía» se guarda como `POLICIA`. Conserva el rol Policía y el rango, sin asignar UCOP/CIC. Cambiar a esta opción retira ambas ramas y mantiene la regla de autorización de Directiva. Las altas nuevas sin rama de Discord se registran en Policía general. Se incluyen en personal, sanciones, bitácoras y resúmenes. La migración `20261029011227_police_unassigned_branch.sql` actualiza el valor por defecto y la validación de turnos; no reclasifica las fichas existentes.

## Correcciones de nuevos ingresos

Cada solicitud de Nuevo ingreso permite «Editar datos»: nombre IC, placa, usuario de Steam y aprobación de entrevista. La cuenta de Discord y el estado no son editables desde ese formulario. UCOP envía la corrección a Pendientes; Directiva puede aplicarla directamente o aprobarla. La comparación de `updated_at` evita sobrescribir una edición más reciente. Los cambios se guardan en auditoría. En solicitudes ya aprobadas se corrige solo la solicitud; las fichas de personal activo se gestionan por separado.
