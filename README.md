# PRIME POLICE · Panel administrativo

Panel privado de gestión de personal de PRIME POLICE, orientado a UCOP y RR. HH. La interfaz está publicada en GitHub Pages y usa Supabase Edge Functions para validar el acceso, guardar los registros y sincronizar acciones autorizadas con Discord.

## Módulos

- **Postulaciones:** formulario modal privado, registro de nombre/edad IC y edad OOC, revisión desde la web, aceptación o rechazo y asignación del rol de Preselección.
- **Solicitudes de rango:** revisión de las solicitudes enviadas por el personal desde Discord.
- **Preseleccionados:** base independiente para personas aceptadas que todavía no han ingresado en la Policía.
- **Personal de Policía:** fichas con nombre IC/OOC, placa, usuario de Discord, rango, unidad y estado; búsqueda, filtros y expediente individual.
- **Ascensos y descensos:** configuración de la escala a partir de roles de Discord, cambios de rango, motivo e historial de auditoría.
- **Sanciones:** registro de Warn y Strike, motivo y evidencia, publicación en sus canales, sincronización de roles e historial. El tercer Strike asigna Expulsado y retira Policía; no expulsa del servidor.

## Ingreso administrativo desde Preseleccionados

Cada fila de Preseleccionados ofrece Ingresar a la base. El gestor corrige el nombre IC, añade placa y Steam y confirma quién aprobó la entrevista IC. Directiva puede aplicarlo directamente; los demás gestores preparan la propuesta para Pendientes. El servidor verifica la preselección activa, el rol de Discord y la ausencia de ficha o placa duplicadas. Se asignan Policía, la división seleccionada (Sin rama, UCOP o CIC), el rango inicial elegido y el apodo Nombre IC #placa. El rango puede dejarse pendiente. La migración `20261030011121_preselection_admission_rank_and_branch.sql` guarda la división y el rango con el ingreso y registra su asignación inicial en el historial.

La migración `20261029143459_preselection_administrative_ingress.sql` guarda en una transacción la ficha, la conversión de la preselección, el ingreso administrativo aceptado y la auditoría. El identificador de operación impide duplicados al reintentar. Un fallo incierto de conexión no revierte roles de un ingreso que podría estar ya guardado; la interfaz conserva los datos y pide comprobar el registro.

## Ausencias

El canal `1539970136050499668` contiene el panel privado de ausencias de RRHH UCOP. Policía puede registrar fechas y motivo sin aprobación, con identidad y ficha obtenidas del servidor. La web permite registrar y cancelar ausencias directamente a los gestores autorizados. Estas dos operaciones son excepciones al circuito de aprobación de Directiva. Se conserva el historial completo y se rechazan fechas superpuestas y reenvíos duplicados. El último día está incluido, usando el calendario del servidor Europe/Paris.

El módulo Ausencias tiene un listado por oficial con placa, rango, estado y número de registros, historial filtrado por agente, registro administrativo y estados vigentes/programados/finalizados. Personal y el panel principal distinguen disponibles y ausentes. Inactividad separa a quienes tienen una ausencia vigente; no se aplican sanciones ni bajas automáticas. La disponibilidad se calcula en cada consulta, sin cambiar el rol Policía ni cerrar bitácoras automáticamente. Las solicitudes y motivos solo están en tablas privadas, con RLS y acceso exclusivo del servidor.

## Acceso y datos

Las sesiones del panel usan `PANEL_SESSION_SIGNING_KEY`, independiente del token de Discord, e incluyen un identificador que se valida en el servidor. Caducan en doce horas o después de dos horas sin actividad. Cerrar sesión revoca el registro; Mis sesiones permite revisar dispositivos y cerrar los demás accesos. La actualización invalida los tokens antiguos. La migración `20261029133640_panel_sessions_and_limits.sql` añade las tablas privadas y las funciones de control de sesión y límites de peticiones; ninguna es accesible para anon/authenticated.

Las listas principales usan `records` con tablas y filtros permitidos explícitamente, búsqueda en el servidor, páginas de 25 registros y contadores completos. El directorio utilizado para seleccionar oficiales se recorre en lotes sin el antiguo límite de 500. El expediente disciplinario consulta solo al agente seleccionado. Las lecturas de rangos comparten una caché de 30 segundos que se invalida al guardar cambios.

`npm ci --ignore-scripts` y `npm run build` generan exclusivamente `dist/`: HTML, manifiesto, icono y dos archivos compactados con nombres derivados de su contenido. GitHub Pages publica esa carpeta, sin fuentes TypeScript del servidor, migraciones, documentación, dependencias ni mapas de código. El navegador todavía recibe el código público necesario para funcionar; la compactación no impide copiarlo. Mientras este repositorio sea público, sus fuentes e historial seguirán disponibles en GitHub. La confidencialidad de los originales requiere un repositorio privado y un alojamiento compatible con él; hacer privado el repositorio sin revisar el plan de Pages puede interrumpir la web.

En Bitácoras, Forzar cierre permite corregir la entrada e indicar la salida real en horario local (mismo día, día siguiente u otra fecha), o completar la salida con Cerrar ahora. Eliminar está disponible en turnos abiertos y completados; requiere motivo y conserva un respaldo privado del registro en la auditoría antes de retirarlo de los totales. UCOP y Directiva pueden cerrar y eliminar bitácoras directamente, con motivo y auditoría. Los demás gestores envían estas operaciones a Pendientes de Directiva. La migración `20261029131718_police_shift_admin_delete.sql` concede al servidor el permiso necesario para eliminar bitácoras; los clientes públicos siguen sin acceso a la tabla.

Al aceptar una postulación o un traslado, el panel asigna el rol correspondiente y pone el nombre IC de la solicitud como apodo de Discord, sin placa. El ingreso posterior como Policía sigue utilizando Nombre IC #placa. Si Discord impide cambiar el apodo (por ejemplo, al propietario del servidor), la aceptación se conserva y el panel muestra una advertencia. Este cambio se aplica a las nuevas aceptaciones; no modifica solicitudes antiguas automáticamente.

El inicio de sesión se hace con Discord. Solo pueden entrar integrantes que tengan al menos uno de los roles gestores configurados en `prime-police-panel/index.ts` y `prime-police-panel/hr.ts`. Las funciones validan la sesión y los roles en el servidor antes de cada operación. Las tablas usan RLS y las funciones acceden a ellas con la clave privada de servicio.

No guardes tokens de Discord, claves de Supabase ni la clave `service_role` en `index.html`, GitHub o mensajes. Configúralos en los secretos de Supabase:

- `DISCORD_BOT_TOKEN`
- `DISCORD_OAUTH_CLIENT_SECRET`

Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a las Edge Functions. El identificador de aplicación Discord, roles, canales y proyecto de Supabase están configurados en el código; revísalos antes de reutilizar este repositorio en otro servidor.

## Despliegue

- **Panel:** <https://primepolice.link/>
- **Proyecto Supabase:** `ngkmylqsdeevdtrjrgfn`
- **Interacciones del bot:** `https://ngkmylqsdeevdtrjrgfn.supabase.co/functions/v1/prime-police-discord`
- **Retorno OAuth de Discord:** `https://ngkmylqsdeevdtrjrgfn.supabase.co/functions/v1/prime-police-panel?panel=oauth-callback`

GitHub Pages publica la rama `main` con `.github/workflows/pages.yml`. El backend está formado por `prime-police-panel` (panel y RR. HH.) y `prime-police-discord` (comandos e interacciones). Las tablas y cambios de esquema están versionados en `supabase/migrations/`; antes de desplegar una instalación nueva, aplica todas las migraciones en orden en el proyecto Supabase.

El dominio personalizado `primepolice.link` se configura en Pages, con cuatro registros A de la raíz hacia los servidores de GitHub Pages y CNAME de `www` hacia `primepolicerp.github.io`, y HTTPS obligatorio. Al publicar mediante Actions no hace falta un archivo CNAME. El retorno OAuth en Discord sigue siendo la función de Supabase; esa función vuelve al dominio nuevo después de validar el acceso. `site-config.ts` limita los orígenes al dominio HTTPS de producción; la respuesta HTTP aplica esa lista también a los errores de los módulos internos.

Los rangos se configuran dentro del panel: abre **Ascensos y descensos**, añade los roles de rango del servidor en el orden jerárquico y guarda la escala. No importes todos los roles sin revisar cuáles pertenecen realmente a la escala policial.

## Archivos principales

- `index.html`: interfaz del panel.
- `supabase/functions/prime-police-panel/index.ts`: acceso, postulaciones, decisiones y sanciones.
- Solicitudes de traslado: formulario privado en el canal `1564900830077788190`, revisión en la pestaña **Traslados** y asignación del rol `1564907324638888017` al aceptar. El rol permite coordinar una entrevista IC; no añade automáticamente el rol de Policía.
- `supabase/functions/prime-police-panel/hr.ts`: personal, solicitudes de rango, jerarquía e historial.
- `supabase/functions/prime-police-discord/index.ts`: comandos e interacciones de Discord.
- `supabase/migrations/`: esquema de postulaciones, preseleccionados, personal, rangos, solicitudes e historial.

## Autorización de ascensos

Directiva incluye Gobierno/Alta Directiva `1539970134565982313`, Directiva `1539970134544748562` y Directiva `1539970134519578774`. Puede aplicar ascensos directamente y revisar propuestas. UCOP y los demás gestores pueden preparar cualquier cambio desde la web; su propuesta no se aplica hasta que Directiva la aprueba. Esto incluye personal, ascensos, descensos, escala de rangos, sanciones, ingresos, postulaciones, traslados y apodos. Como excepciones, UCOP puede cerrar y eliminar bitácoras directamente, y los gestores pueden registrar o cancelar ausencias sin aprobación. Los botones de entrada y salida personales de Discord siguen registrando el servicio del agente.

Las nuevas propuestas se revisan en Panel principal → Cambios pendientes de Directiva. Hay pestañas de Pendientes e Historial con detalles y paginación. Los ascensos pendientes del sistema anterior también aparecen allí. Una aprobación comprueba que el rango actual sigue siendo el de la propuesta y vuelve a validar los permisos del revisor. Las operaciones simultáneas para un agente se protegen mediante una reserva con caducidad. Si una propuesta queda en procesamiento tras un corte, revisar Discord y la ficha antes de cualquier reparación manual.

La migración `20261028194311_police_rank_authorizations.sql` añade las autorizaciones, reservas, auditoría y el resumen de horas por período. El historial horario se consulta por fechas y páginas de 50 registros. Los permisos de gestión se verifican de nuevo en cada operación; las consultas comparten una caché de roles de 10 segundos.

La migración `20261028195820_police_all_changes_approval.sql` añade la bandeja general de cambios. La revisión comprueba el estado original de cada registro y bloquea propuestas obsoletas. Solo se admiten las operaciones enumeradas en `change-requests.ts`; nunca se ejecutan rutas arbitrarias del solicitante.

## Conexión y confirmación de operaciones

El panel comparte las consultas simultáneas a Discord, respeta sus respuestas de límite temporal y reintenta una vez las lecturas que fallen por conexión o errores del servicio. Los cambios no se repiten automáticamente tras un corte de red o un error incierto del servidor. La web conserva la sesión ante fallos temporales y muestra una referencia de petición para localizar el error. El chequeo público de conexión ya no registra ni consulta comandos de Discord en cada carga.

## Policía sin rama

La opción «Sin rama · Policía» se guarda como `POLICIA`. Conserva el rol Policía y el rango, sin asignar UCOP/CIC. Cambiar a esta opción retira ambas ramas y mantiene la regla de autorización de Directiva. Las altas nuevas sin rama de Discord se registran en Policía general. Se incluyen en personal, sanciones, bitácoras y resúmenes. La migración `20261029011227_police_unassigned_branch.sql` actualiza el valor por defecto y la validación de turnos; no reclasifica las fichas existentes.

## Correcciones de nuevos ingresos

Cada solicitud de Nuevo ingreso permite «Editar datos»: nombre IC, placa, usuario de Steam y aprobación de entrevista. La cuenta de Discord y el estado no son editables desde ese formulario. UCOP envía la corrección a Pendientes; Directiva puede aplicarla directamente o aprobarla. La comparación de `updated_at` evita sobrescribir una edición más reciente. Los cambios se guardan en auditoría. En solicitudes ya aprobadas se corrige solo la solicitud; las fichas de personal activo se gestionan por separado.

### Espera tras rechazar una postulación

La RPC privada `submit_police_application` mantiene el máximo de tres intentos y aplica una espera de 12 horas tras el primer rechazo y 48 horas tras el segundo, contadas desde `reviewed_at`. Los envíos durante la espera no consumen intentos. El bot muestra la fecha de desbloqueo en la zona horaria del usuario y el mensaje privado de rechazo informa de la espera. Las solicitudes históricas sin fecha de revisión usan su fecha de creación.

### Listado público de aceptados

El canal `1564350390294552696` publica dos tarjetas de RR. HH.: postulaciones y traslados aceptados. Solo se muestran nombre IC y cuenta de Discord, sin edades, respuestas, motivos ni datos de revisión. Cada aceptación actualiza las tarjetas en segundo plano; se pagina el listado completo, se deduplican personas por tipo y se editan los mensajes del propio bot, sin menciones ni avisos masivos. `public-accepted.ts` usa un bloqueo compartido y reintentos; los fallos de publicación no invalidan una aceptación ya guardada.

### Ingreso desde Traslados aceptados

Cada traslado aceptado ofrece Ingresar a la base, con el mismo formulario de preseleccionados: nombre IC, placa, Steam, entrevista, división y rango. Directiva ejecuta el ingreso; UCOP prepara una propuesta. El servidor comprueba la solicitud aceptada, su titular y revisión, el rol Traslado/Policía, la ausencia de expulsión y las colisiones de ficha o placa. La RPC privada `admit_police_transfer` guarda ficha, rango inicial, auditoría y marca de ingreso en una transacción. Conserva el traslado aceptado en el historial; un ingreso confirmado no vuelve a ofrecer el botón. Tras guardar se retira el rol Traslado y se conserva Policía, la división, el rango y el apodo Nombre IC #placa.

### Placas en orden y asignación automática

Personal se ordena numéricamente por placa, también entre páginas. Los formularios de Registrar agente e Ingresar a la base (Preseleccionados y Traslados) proponen la siguiente placa a partir de 0116. La asignación definitiva se reserva en el servidor al enviar, con referencia idempotente, bloqueo compartido y unicidad normalizada: 116 y 0116 representan la misma placa. Se conservan las placas existentes y se permite escribir manualmente una inferior para altos rangos. El contador continúa después de la mayor placa ya utilizada o reservada; las propuestas pendientes y las reservas conservadas pueden dejar huecos para evitar reutilizar números. Las reservas son privadas y no se incluyen en la web pública. La migración `20261030013651_police_plate_sequence_and_order.sql` añade orden numérico, reservas y protección contra colisiones en todos los registros de personal.

### Ficha policial y observaciones internas

Ver ficha abre un expediente adaptable a escritorio y móvil con identidad IC/OOC, Steam, placa, división, estado, horas y turnos de la semana en Europe/Paris, ausencias, sanciones, última actividad e historial de rangos paginado. Los días en rango se muestran solo cuando existe fecha de cambio registrada. Editar ficha permite corregir también Steam; se conserva el estado previo del agente.

Las observaciones se añaden, editan y archivan con autor, fecha y control de versión. Directiva las aplica; UCOP prepara propuestas para Pendientes. Al aprobar se conserva la autoría del proponente, verificada con el expediente de aprobación. La RPC privada `mutate_police_personnel_note` guarda cada versión y la auditoría en una transacción; no elimina físicamente los textos archivados. Las notas no se publican en Discord. Los borradores permanecen en memoria al cerrar y reabrir la ficha y se borran al cerrar sesión. Un fallo parcial muestra datos no disponibles en vez de ceros inventados.

## Integridad de la web publicada

El compilador calcula integridad SHA-384 para JavaScript y CSS. La política CSP de producción autoriza únicamente el hash del programa generado y bloquea manejadores de eventos inline; los elementos incluyen SRI para detectar archivos alterados. Esto protege la carga de recursos y no impide descargar el código público ni protege frente a un atacante que controle también el HTML. Los originales continúan visibles mientras el repositorio sea público.

## Roles por rechazo de postulación

Al guardar un nuevo rechazo se sincroniza Rechazado 1 (1565810468059357194), Rechazado 2 (1565810639178567821) o Rechazado 3 (1565810696266981407), según el número de intento de la candidatura guardada. Primero se añade el nuevo marcador y después se retiran los otros marcadores de rechazo, sin tocar otros roles. Los fallos de Discord se muestran como advertencia y se incluyen en la auditoría; no revierten una decisión ya guardada. Se aplica tanto a postulaciones como a traslados; no cambia los plazos de espera. La actualización administrativa del historial elige el mayor intento rechazado por persona y excluye a quienes fueron aceptados después; comprueba los roles resultantes y registra la operación en auditoría.

Al aceptar una postulación o un traslado se retiran los tres marcadores de rechazo después de guardar la aceptación, conservando los demás roles. Si Discord no permite completar la limpieza, la web informa con una advertencia sin convertir una aceptación guardada en un error.

La migración 20261030225953_panel_session_week_long_timeout.sql amplía las sesiones nuevas a 7 días y el límite de inactividad a 24 horas, conservando revocación manual, caducidad absoluta, aislamiento por usuario y comprobación de roles. Las sesiones anteriores conservan la caducidad de su firma original hasta volver a iniciar sesión. La credencial permanece en sessionStorage: cerrar la pestaña requiere iniciar sesión de nuevo.

## Corrección de rechazos y revisión interna

En Rechazadas, Corregir y aceptar solicita un motivo y usa los mismos permisos de Directiva y propuestas UCOP. Comprueba solicitudes posteriores pendientes o aceptadas, aplica la aceptación, retira marcadores de rechazo y conserva la revisión anterior en auditoría. También está disponible en Traslados.

Cada postulación incluye una revisión interna orientativa: referencias explícitas a asistentes, repeticiones entre apartados y coincidencias exactas de respuestas de más de 120 caracteres con hasta 200 solicitudes recientes de otras cuentas. No calcula probabilidades de IA, no acredita autoría humana, no decide rechazos y no transmite respuestas a servicios externos. La lectura requiere un rol gestor validado en el servidor.

La postulación de Discord tiene dos pasos privados: nombre IC, edad IC y edad OOC separados, y después cuatro preguntas. Los borradores están ligados a la cuenta y al servidor, caducan en 30 minutos y no consumen intentos. Se conserva la validación de esperas y duplicados de la RPC final. Los formularios antiguos abiertos siguen siendo compatibles. La migración 20261031075650_private_application_identity_drafts.sql mantiene los borradores fuera del acceso de anon/authenticated.

## Decisión manual y constancia de revisión

UCOP puede aceptar postulaciones y corregir rechazos directamente; no cambia la autorización requerida para ascensos, sanciones, traslados u otras operaciones. La revisión orientativa de textos nunca acepta ni rechaza una candidatura.

Los gestores pueden guardar una constancia interna: revisada sin marca de IA, posible uso de IA, o uso declarado por el postulante, junto con observación. La identidad y la fecha se guardan en el servidor. Las constancias son nuevas entradas de historial, no sustituyen notas anteriores; los reintentos reutilizan una referencia para impedir duplicados. Solo se muestran las cinco más recientes en la ficha. La tabla police_application_reviews tiene RLS y acceso exclusivo del servidor; no permite UPDATE/DELETE al rol de servicio. Guardar una constancia no modifica el estado ni los roles de la solicitud.

La pestaña Rechazadas · revisión IA es una lista para volver a verificar postulaciones rechazadas cuya última constancia manual sea posible IA o IA declarada. Muestra motivo, autor y fecha de la marca, conserva búsqueda/paginación y permite Corregir y aceptar. La vista privada police_rejected_ai_applications usa security_invoker y las tablas privadas del servidor. Una nueva marca sin IA retira el registro de esta lista; aceptarlo lo mueve a Aceptadas. No se clasifican personas automáticamente ni se cambian los contadores generales de estados.

Las listas de Postulaciones y Traslados muestran avisos automáticos privados al cargar cada página: referencias explícitas a asistentes, copia exacta y secuencias de palabras muy similares. La similitud exige texto largo y alto solapamiento de grupos de cinco palabras; no analiza la formalidad ni atribuye autoría. Se comparan hasta 200 solicitudes recientes de otras cuentas del mismo tipo, con normalización reutilizada solo durante esa petición. No usa ChatGPT/Claude ni otra API externa, no tiene coste adicional de IA, no guarda marcas manuales ni modifica decisiones. Si falla la comparación se conserva la lista y se avisa de que el análisis no está disponible.

En los intentos 2 y 3 de Postulaciones y Traslados se muestran los rechazos anteriores de la misma cuenta y del mismo tipo de solicitud: número de intento, motivo, responsable y fecha disponibles. La consulta privada se agrupa por página y excluye intentos posteriores y la solicitud actual. Si falla, se indica que el historial no está disponible; no se inventan motivos ni responsables.

El botón Ingresar a la base en Preseleccionados y Traslados solo se ofrece si una consulta privada a Personal confirma que no existe una ficha para ese ID de Discord. También se comprueban fichas inactivas y altas manuales. Un fallo de consulta oculta el ingreso hasta actualizar; el servidor conserva su comprobación contra altas duplicadas.
