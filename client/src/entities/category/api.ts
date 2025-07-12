import { Category } from './model';
import { httpClient } from '../../shared/api/httpClient';

export async function fetchCategories(): Promise<Category[]> {
  const res = await httpClient('/categories');
  return res.json();
}
