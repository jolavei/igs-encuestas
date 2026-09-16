// Deriva un tipo de dispositivo grueso desde el User-Agent, para control de calidad
// (sobre todo del canal público anónimo por QR). No pretende ser exhaustivo:
// devuelve "mobile" | "tablet" | "desktop", o null si no hay User-Agent.
export function deviceTypeFromUA(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  // Tablet primero: los iPad/Android-tablet también matchean patrones "mobile".
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(s))
    return "mobile";
  return "desktop";
}
