// Vercel serverless function entry point
// This imports and re-exports the TypeScript Express app

// Use dynamic import to load the TypeScript module
export default async function handler(req, res) {
  const { default: app } = await import('./index.ts');
  return app(req, res);
}