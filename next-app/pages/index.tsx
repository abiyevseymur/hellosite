import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function Home() {
  const { data, error } = useSWR('/api/records', fetcher);

  if (error) return <div>Failed to load</div>;
  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h1>Cricket Records</h1>
      {data.map((cat: any) => (
        <div key={cat.id}>
          <h3>{cat.name}</h3>
          <pre>{JSON.stringify(cat.records, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}
