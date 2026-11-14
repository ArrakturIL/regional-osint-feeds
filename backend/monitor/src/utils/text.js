export function textOnly(value) {
  return value?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
}

export function href(value, base) {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" && url.origin === new URL(base).origin ? url.href : null;
  } catch {
    return null;
  }
}

