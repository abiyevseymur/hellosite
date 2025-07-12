import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>HelloSite Client</h1>
      <Link href="/records">View Records</Link>
    </main>
  );
}
