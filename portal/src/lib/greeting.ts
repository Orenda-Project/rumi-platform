/** The dashboard's greeting; no name yet (Rumi may not have learned it) means no name, not an empty one. */
export function welcomeBack(firstName: string | null | undefined): string {
  const name = (firstName || "").trim();
  return name ? `Welcome back, ${name}!` : "Welcome back!";
}
