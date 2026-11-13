// Stand-in for '@devvit/web/client' in the offline preview build only.
export function requestExpandedMode(_e: Event, entry: string) {
  location.href = `${entry}.html${location.search}`;
}
export function navigateTo(url: string) {
  window.open(url, '_blank');
}
export function showToast(text: string) {
  console.info('[toast]', text);
}
export const context = { username: 'you' };
