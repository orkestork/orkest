/**
 * Hora del servidor para componentes de servidor: se renderizan una vez por petición,
 * así que leer el reloj aquí es estable dentro de esa petición.
 */
export const nowMs = () => Date.now();
