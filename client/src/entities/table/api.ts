import { Table } from './model';
import { httpClient } from '../../shared/api/httpClient';

export async function fetchTable(id: number): Promise<Table> {
  const res = await httpClient(`/tables/${id}`);
  return res.json();
}
