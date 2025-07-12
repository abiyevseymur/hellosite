import { CategoryTree } from '../../features/category-tree';
import { Category } from '../../entities/category/model';

interface Props {
  initialCategories: Category[];
}

export function RecordsPage({ initialCategories }: Props) {
  return (
    <main>
      <h1>Records</h1>
      <CategoryTree initial={initialCategories} />
    </main>
  );
}
