import { createRouter } from "@real-router/core";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "c", path: "/c" },
];

async function main(): Promise<void> {
  console.log("step0");

  const router = createRouter(routes as never, {
    logger: {
      level: "error",
      callbackIgnoresLevel: true,
      callback: (...a: unknown[]) => console.log("LOG", ...a),
    },
  } as never);

  console.log("step1 created");
  router.usePlugin((() => ({ onStart: () => undefined })) as never);
  console.log("step2 plugin");
  await router.start("/a");
  console.log("step3 started", router.getState()?.name);
}

void main().catch((e: unknown) => console.log("THROWN", e));
