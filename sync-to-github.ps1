$sourceRoot = "C:\Users\LAINETS ThinkPad\Documents\beta CCTV app creation"
$targetRoot = "C:\Users\LAINETS ThinkPad\Documents\GitHub\vizexprototype"

$files = @(
  ".env.example",
  ".gitignore",
  "index.html",
  "package.json",
  "package-lock.json",
  "README.md",
  "REMOTE_STREAM_GATEWAY.md",
  "supabase_schema.sql",
  "sync-to-github.ps1",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vercel.json",
  "VERCEL_DEPLOYMENT.md",
  "VERCEL_UPLOAD_CHECKLIST.md",
  "vite.config.ts",
  "VIZEXAPP_TECHNICAL_BLUEPRINT.md"
)

$directories = @(
  "api",
  "gateway",
  "public",
  "src"
)

$cleanupPaths = @(
  "node_modules",
  "dist",
  ".vercel",
  "tmp_dolynk_docs",
  "deploy-test",
  "github-vercel-export",
  "github-vercel-export-clean",
  "VIZEXAPP_GITHUB_UPLOAD",
  "gateway-logs",
  "tools",
  "vite.config.js",
  "vite.config.d.ts",
  "vite-dev.log",
  "vite-dev-error.log"
)

foreach ($path in $cleanupPaths) {
  $targetPath = Join-Path $targetRoot $path
  if (Test-Path $targetPath) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }
}

foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $targetRoot $file) -Force
}

foreach ($directory in $directories) {
  $sourcePath = Join-Path $sourceRoot $directory
  $targetPath = Join-Path $targetRoot $directory

  if (Test-Path $targetPath) {
    Remove-Item -LiteralPath $targetPath -Recurse -Force
  }

  Copy-Item -LiteralPath $sourcePath -Destination $targetRoot -Recurse -Force
}
