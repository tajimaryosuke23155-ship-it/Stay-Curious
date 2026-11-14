export const SUPABASE_URL = 'https://wiglfddygldrnebqfhpn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_cGuWmJFqG7OlKC7ZG5hz0w_wuYot0tY';

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    "'": '''
  }[m]));
}
