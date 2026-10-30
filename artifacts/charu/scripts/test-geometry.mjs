import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  cacheDir: "/tmp/charu-geometry-test-vite",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  await server.ssrLoadModule("/src/lib/geometry-layout.test.ts");
  await server.ssrLoadModule("/src/lib/desk-kit-model.test.ts");
  await server.ssrLoadModule("/src/lib/scene-agent.test.ts");
} finally {
  await server.close();
}
