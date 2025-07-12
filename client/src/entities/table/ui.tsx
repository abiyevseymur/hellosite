import { useEffect, useState } from 'react';
import { fetchTable } from './api';
import { Table } from './model';

interface Props {
  tableId: number;
  title: string;
}

export function TableView({ tableId, title }: Props) {
  const [table, setTable] = useState<Table | null>(null);

  useEffect(() => {
    fetchTable(tableId).then(setTable);
  }, [tableId]);

  if (!table) return <div>Loading...</div>;

  return (
    <div>
      <h3>{title}</h3>
      <table border={1} cellPadding={4}>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, idx) => (
            <tr key={idx}>
              {table.columns.map((c) => (
                <td key={c}>{(row as any)[c]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
