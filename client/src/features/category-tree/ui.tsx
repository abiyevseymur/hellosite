import { useEffect, useState } from 'react';
import { fetchCategories } from '../../entities/category';
import { Category } from '../../entities/category/model';
import { CategoryItem } from '../../entities/category/ui';

interface Props {
  initial?: Category[];
}

export function CategoryTree({ initial = [] }: Props) {
  const [items, setItems] = useState<Category[]>(initial);

  useEffect(() => {
    if (initial.length === 0) {
      fetchCategories().then(setItems);
    }
  }, [initial.length]);

  return (
    <ul>
      {items.map((cat) => (
        <CategoryItem key={cat.id} category={cat} />
      ))}
    </ul>
  );
}
