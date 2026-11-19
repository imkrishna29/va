import { previewPathPrefix } from "./preview-path-prefix.ts";

export function publicUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  if (typeof window === "undefined") return `/${clean}`;
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}/${clean}`;
}

export function absolutePublicUrl(path: string): string {
  const relative = publicUrl(path);
  if (typeof window === "undefined") return relative;
  return new URL(relative, window.location.origin).toString();
}
