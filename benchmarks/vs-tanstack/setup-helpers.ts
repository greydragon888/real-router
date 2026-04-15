export function getRequiredLink(
  container: ParentNode,
  testId: string,
  cache?: Map<string, HTMLAnchorElement>,
): HTMLAnchorElement {
  const cached = cache?.get(testId);

  // isConnected — O(1) check. Detached elements (after React unmount)
  // don't bubble events to container → React event delegation misses click.
  if (cached?.isConnected) {
    return cached;
  }

  const link = container.querySelector<HTMLAnchorElement>(
    `[data-testid="${testId}"]`,
  );

  if (!link) {
    throw new Error(`Link not found: ${testId}`);
  }

  cache?.set(testId, link);

  return link;
}

export async function waitForRequiredLink(
  container: ParentNode,
  testId: string,
  cache?: Map<string, HTMLAnchorElement>,
): Promise<HTMLAnchorElement> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const link = container.querySelector<HTMLAnchorElement>(
      `[data-testid="${testId}"]`,
    );

    if (link) {
      cache?.set(testId, link);

      return link;
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }

  return getRequiredLink(container, testId, cache);
}
