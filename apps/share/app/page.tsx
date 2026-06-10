/**
 * Public landing. Intentionally lists nothing — diagrams are only reachable
 * through tokened /d/ and /f/ links (see src/lib/content.ts).
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Swimlane Share</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Diagrams on this site are shared by link. If someone sent you a link,
        open it directly — there is nothing to browse here.
      </p>
    </main>
  );
}
