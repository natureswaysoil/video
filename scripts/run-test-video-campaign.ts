diff --git a/scripts/run-test-video-campaign.ts b/scripts/run-test-video-campaign.ts
index a9fd4a5..fd585a9 100644
--- a/scripts/run-test-video-campaign.ts
+++ b/scripts/run-test-video-campaign.ts
@@ -242,6 +242,49 @@ async function uploadVideoToSupabase(localVideoPath: string, seedFileName: strin
   return publicUrl
 }
 
+// Scene-level suffixes used in seed videoFileName values (e.g. "dog-urine-easy-routine.mp4").
+// The bundled test-campaign-videos/ directory only ships one generic clip per product
+// (e.g. "dog-urine-neutralizer-test.mp4"), so seeds are resolved to the product-level file
+// by stripping the scene suffix and prefix-matching against the files that actually exist.
+const SCENE_SUFFIXES = ['problem-hook', 'solution-reveal', 'soil-science', 'results-proof', 'easy-routine']
+
+function listAvailableTestVideos(testVideosDir: string): string[] {
+  if (!fs.existsSync(testVideosDir)) return []
+  return fs.readdirSync(testVideosDir).filter((f) => /\.mp4$/i.test(f))
+}
+
+/**
+ * Resolve a seed's declared videoFileName to a file that actually exists on disk.
+ * 1. Exact filename match wins.
+ * 2. Otherwise derive the product prefix (strip a known scene suffix) and prefix-match.
+ * Throws a descriptive error (listing available files) if nothing matches.
+ */
+function resolveExistingVideoFileName(seedFileName: string, testVideosDir: string): string {
+  if (fs.existsSync(path.resolve(testVideosDir, seedFileName))) return seedFileName
+
+  const base = seedFileName.replace(/\.mp4$/i, '')
+  let prefix = base
+  for (const suffix of SCENE_SUFFIXES) {
+    if (base.endsWith(`-${suffix}`)) {
+      prefix = base.slice(0, -(suffix.length + 1))
+      break
+    }
+  }
+
+  const available = listAvailableTestVideos(testVideosDir)
+  const match =
+    available.find((f) => f.startsWith(`${prefix}-`)) || available.find((f) => f.startsWith(prefix))
+  if (match) {
+    console.log(`ℹ️ Mapped seed video "${seedFileName}" → bundled file "${match}" (product prefix "${prefix}")`)
+    return match
+  }
+
+  throw new Error(
+    `No bundled test video matches seed "${seedFileName}" (product prefix "${prefix}"). ` +
+      `Available in ${testVideosDir}: ${available.length ? available.join(', ') : '(none)'}`
+  )
+}
+
 async function resolveVideoUrl(seedFileName: string, testVideosDir: string, state: RotationState): Promise<string> {
   const localVideoPath = path.resolve(testVideosDir, seedFileName)
   if (!fs.existsSync(localVideoPath)) {
@@ -292,18 +335,17 @@ async function main(): Promise<void> {
     throw new Error(`Seed is missing videoFileName: ${seed.title}`)
   }
 
-  const localVideoPath = path.resolve(testVideosDir, seed.videoFileName)
-  if (!fs.existsSync(localVideoPath)) {
-    throw new Error(`Missing test video: ${localVideoPath}`)
-  }
+  const resolvedVideoFileName = resolveExistingVideoFileName(seed.videoFileName, testVideosDir)
+  const localVideoPath = path.resolve(testVideosDir, resolvedVideoFileName)
 
-  const videoUrl = dryRun ? `file://${localVideoPath}` : await resolveVideoUrl(seed.videoFileName, testVideosDir, state)
+  const videoUrl = dryRun ? `file://${localVideoPath}` : await resolveVideoUrl(resolvedVideoFileName, testVideosDir, state)
 
   console.log('🎯 Test video campaign slot selected')
   console.log({
     rotationIndex: index,
     title: seed.title,
     videoFileName: seed.videoFileName,
+    resolvedVideoFileName,
     websiteUrl: seed.websiteUrl,
     dryRun,
   })
