import { GetServerSideProps } from 'next';
import { RecordsPage } from './ui';
import { fetchCategories } from '../../entities/category';
import { Category } from '../../entities/category/model';

interface Props {
  initialCategories: Category[];
}

export default function Records({ initialCategories }: Props) {
  return <RecordsPage initialCategories={initialCategories} />;
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const initialCategories = await fetchCategories();
  return { props: { initialCategories } };
};
