# PRIME POLICE · Panel administrativo

Panel web para que el personal autorizado revise las postulaciones pendientes, aceptadas y rechazadas.

## Componentes

- `index.html`: interfaz del panel administrativo.
- Edge Function de Supabase `prime-police-panel`: acceso temporal, lectura de solicitudes y registro de decisiones.
- Edge Function de Supabase `prime-police-discord`: comandos e interacciones del bot.
- `supabase/migrations/20261026160000_prime_police_application_answers.sql`: añade el campo JSON de respuestas a las solicitudes.

## Publicación web

- Panel: https://elplaza26.github.io/PRIME-POLICE/
- GitHub Pages debe tener el origen de publicación configurado como **GitHub Actions**.
- El workflow `.github/workflows/pages.yml` publica el contenido del repositorio al enviar cambios a `main` o al ejecutarlo manualmente.

## Configuración de Discord

1. Guarda `DISCORD_PUBLIC_KEY` y `DISCORD_BOT_TOKEN` en la configuración de la Edge Function de Supabase.
2. Configura en Discord Developer Portal la URL de interacciones: `https://ngkmylqsdeevdtrjrgfn.supabase.co/functions/v1/prime-police-discord`.
3. Comprueba que el bot puede enviar mensajes y que su rol está por encima del rol de Policía para asignarlo al aceptar una candidatura.

No publiques `DISCORD_BOT_TOKEN` en GitHub ni en el navegador.
