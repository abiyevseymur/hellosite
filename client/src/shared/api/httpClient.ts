const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function httpClient(path: string, init?: RequestInit) {
  const url = `${API_URL}${path}`;
  return fetch(url, init);
}
