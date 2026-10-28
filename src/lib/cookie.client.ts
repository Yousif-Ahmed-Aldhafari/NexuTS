// Client-side cookie utilities.
// These functions manage cookies in the browser only.
// Server actions handle cookie updates on the server side.

export function setClientCookie(key: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // biome-ignore lint/suspicious/noDocumentCookie: Non-auth preference cookies must support browsers without Cookie Store.
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function getClientCookie(key: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${key}=`))
    ?.split("=")[1];
}

export function deleteClientCookie(key: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: Deletes only client-readable preference cookies.
  document.cookie = `${encodeURIComponent(key)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
