export interface Category {
  id: number;
  title: string;
  type: string;
  children: Category[];
  tables: { id: number; title: string }[];
}
