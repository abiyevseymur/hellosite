import { useState } from 'react';
import { Category } from './model';
import { fetchCategoryById } from './apiSingle';
import { TableView } from '../table';

interface Props {
  category: Category;
}

export function CategoryItem({ category }: Props) {
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState<Category | null>(null);

  const handleClick = async () => {
    if (category.children.length === 0) return;
    if (!child) {
      const full = await fetchCategoryById(category.id);
      setChild(full);
    }
    setOpen(!open);
  };

  return (
    <li>
      <span onClick={handleClick} style={{ cursor: category.children.length ? 'pointer' : 'default' }}>
        {category.title}
      </span>
      {open && child && (
        <ul>
          {child.children.map((c) => (
            <CategoryItem key={c.id} category={c} />
          ))}
          {child.tables.map((t) => (
            <li key={t.id}>
              <TableView tableId={t.id} title={t.title} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
