export function formatCodeClient(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
