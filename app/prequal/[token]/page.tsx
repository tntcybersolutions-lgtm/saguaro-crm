import PrequalClient from './PrequalClient';

export default async function PrequalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PrequalClient token={token} />;
}
