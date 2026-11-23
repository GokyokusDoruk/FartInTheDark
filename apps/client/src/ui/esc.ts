/** Escape text for innerHTML. */
export const esc = (s: string) => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
