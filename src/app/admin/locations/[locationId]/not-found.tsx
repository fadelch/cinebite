import Link from "next/link";

export default function AdminStructureNotFound() {
  return (
    <div className="cb-panel px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-zinc-100">Cinema structure not found</h1>
      <p className="mt-2 text-sm text-zinc-500">The requested location or hall does not exist, or it is not available to your account.</p>
      <Link href="/admin/locations" className="cb-button-secondary mt-6">Return to locations</Link>
    </div>
  );
}
