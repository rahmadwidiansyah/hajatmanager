import DeviceGoogleStartClient from "./StartClient";

/**
 * Fase 4 (start): dibuka oleh app desktop (Windows/Linux) di browser sistem.
 * App memberi ?state=&port=[&device=]; dibaca server-side lalu
 * diteruskan ke finish via callbackUrl setelah login Google web biasa.
 */
export default async function DeviceGoogleStartPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; port?: string; device?: string }>;
}) {
  const sp = await searchParams;
  return (
    <DeviceGoogleStartClient
      state={sp.state ?? ""}
      port={sp.port ?? ""}
      device={(sp.device ?? "").slice(0, 100)}
    />
  );
}
