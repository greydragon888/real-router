export async function HelloWorld({ route }: { route: string }) {
  await new Promise((r) => setTimeout(r, 5));

  return (
    <article data-testid="hello">
      <h1>Hello from Server Component</h1>
      <p data-testid="route">Route: {route}</p>
    </article>
  );
}
