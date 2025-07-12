import { Category } from './model';
import { httpClient } from '../../shared/api/httpClient';

export async function fetchCategoryById(id: number): Promise<Category> {
  const res = await httpClient(`/categories/${id}`);
  return res.json();
}
