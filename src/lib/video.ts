import type { Exercise } from '../types';

/**
 * Link para ver o exercício no YouTube: uma busca pelo nome do exercício em
 * português, que funciona no navegador e abre o app do YouTube no celular (e
 * não quebra se um vídeo for apagado).
 */
export function videoUrl(ex: Exercise): string {
  const query = ex.video ?? `${ex.name} como fazer`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
