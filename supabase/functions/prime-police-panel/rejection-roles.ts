export const REJECTION_ROLE_IDS = ['1565810468059357194', '1565810639178567821', '1565810696266981407'];

export async function clearRejectionRoles(guildId: string, userId: string, discord: (path: string, init?: RequestInit) => Promise<any>): Promise<string> {
  const base = '/guilds/' + guildId + '/members/' + encodeURIComponent(userId);
  try {
    const member = await discord(base);
    for (const role of REJECTION_ROLE_IDS) {
      if ((member.roles || []).includes(role)) await discord(base + '/roles/' + role, {method: 'DELETE'});
    }
    return '';
  } catch (error) {
    console.error('Accepted application rejection role cleanup failed:', String(error));
    return 'La aceptación se guardó, pero no se pudieron retirar todos los roles de rechazado en Discord. Revisa los permisos y la jerarquía del bot.';
  }
}

export async function syncRejectionRole(guildId: string, userId: string, attempt: number, discord: (path: string, init?: RequestInit) => Promise<any>): Promise<string> {
  if (![1, 2, 3].includes(attempt)) return 'El rechazo se guardó, pero el número de intento no permite asignar un rol.';
  const target = REJECTION_ROLE_IDS[attempt - 1];
  const base = '/guilds/' + guildId + '/members/' + encodeURIComponent(userId);
  try {
    const member = await discord(base);
    const roles: string[] = member.roles || [];
    // Grant the new marker before removing the previous marker; preserve unrelated roles.
    if (!roles.includes(target)) await discord(base + '/roles/' + target, {method: 'PUT', body: '{}'});
    for (const role of REJECTION_ROLE_IDS) {
      if (role !== target && roles.includes(role)) await discord(base + '/roles/' + role, {method: 'DELETE'});
    }
    return '';
  } catch (error) {
    console.error('Application rejection role synchronization failed:', String(error));
    return 'El rechazo se guardó, pero no se pudo completar el rol Rechazado ' + attempt + ' en Discord. Revisa Administrar roles y que el bot esté por encima de los tres roles.';
  }
}
