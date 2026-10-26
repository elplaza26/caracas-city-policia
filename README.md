# PRIME POLICE · Panel administrativo

Panel web para revisar las postulaciones de PRIME POLICE. La interfaz muestra las candidaturas pendientes, aceptadas y rechazadas en secciones separadas.

## Componentes

- `index.html`: interfaz administrativa adaptada a PRIME POLICE.
- Supabase Edge Function `caracas-police-panel`: acceso temporal, lectura de solicitudes y decisiones.
- Supabase Edge Function `caracas-police-discord`: comandos e interacciones del bot.
- `supabase/migrations/20261026160000_prime_police_application_answers.sql`: campo JSON para guardar las respuestas del formulario.

## Activación pendiente

1. Habilitar GitHub Pages desde **Settings → Pages → Build and deployment → Source: GitHub Actions**. El workflow está en `.github/workflows/pages.yml`.
2. Configurar la **Public Key** de la aplicación Discord como `DISCORD_PUBLIC_KEY` en los secretos de la función Supabase (o añadirla al código del endpoint).
3. Confirmar que la URL de interacciones en Discord Developer Portal apunta a `https://ngkmylqsdeevdtrjrgfn.supabase.co/functions/v1/caracas-police-discord`.
4. Verificar que el bot tiene permiso para enviar mensajes y que su rol está por encima del rol de Policía para poder asignarlo al aceptar.

No publiques nunca el `DISCORD_BOT_TOKEN` en GitHub ni en el navegador.
