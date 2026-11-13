/** A separate boot and storage namespace keep test progress out of adventure saves. */
export const SANDBOX_MODE = new URLSearchParams(location.search).has('sandbox');
export const SANDBOX_SAVE_KEY = 'fantasy-rpg-sandbox-v1';
export const SANDBOX_SETTINGS_KEY = 'fantasy-rpg-sandbox-settings-v1';
export function sandboxURL(enabled: boolean) {
  const url = new URL(location.href);
  if (enabled) url.searchParams.set('sandbox', '1');
  else url.searchParams.delete('sandbox');
  return url.href;
}
const RETURN_KEY = 'fantasy.sandboxReturn';
export const RETURNING_FROM_SANDBOX = (() => {
  try {
    const yes = !SANDBOX_MODE && sessionStorage.getItem(RETURN_KEY) === '1';
    if (yes) sessionStorage.removeItem(RETURN_KEY);
    return yes;
  } catch {
    return false;
  }
})();
export function travelToSandbox(enabled: boolean) {
  if (!enabled)
    try {
      sessionStorage.setItem(RETURN_KEY, '1');
    } catch {}
  location.assign(sandboxURL(enabled));
}
