$sourceRoot = "C:\Users\LAINETS ThinkPad\Documents\beta CCTV app creation"
$targetRoot = "C:\Users\LAINETS ThinkPad\Documents\GitHub\vizexprototype"

$files = @(
  ".env.example",
  ".gitignore",
  "index.html",
  "package.json",
  "package-lock.json",
  "README.md",
  "supabase_schema.sql",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vercel.json",
  "VERCEL_DEPLOYMENT.md",
  "VERCEL_UPLOAD_CHECKLIST.md",
  "vite.config.js",
  "vite.config.ts",
  "VIZEXAPP_TECHNICAL_BLUEPRINT.md"
)

$directories = @(
  "public",
  "src"
)

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
