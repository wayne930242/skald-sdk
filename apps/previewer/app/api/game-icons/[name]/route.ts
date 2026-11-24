import icons from "@skald/sheet-sdk/data/game-icons/icons.json";

type IconSet = Record<string, { b: string }>;

/** One game-icons.net SVG (CC BY 3.0, see NOTICE), read from the SDK's local icons.json. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const icon = Object.hasOwn(icons, name) ? (icons as IconSet)[name] : undefined;
  if (!icon) return Response.json({ error: `unknown icon: ${name}` }, { status: 404 });
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${icon.b}</svg>`, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
