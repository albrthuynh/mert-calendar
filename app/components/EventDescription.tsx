"use client";

import { createElement, type ReactNode } from "react";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

const FORMATTING_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "p", "div", "br", "ul", "ol", "li", "blockquote"]);
const HIDDEN_TAGS = new Set(["script", "style", "iframe", "object", "template", "svg", "math"]);

function renderDescriptionNode(node: DefaultTreeAdapterTypes.ChildNode, key: number): ReactNode {
  if (node.nodeName === "#text") return (node as DefaultTreeAdapterTypes.TextNode).value;
  if (!("tagName" in node)) return null;

  const tag = node.tagName;
  if (HIDDEN_TAGS.has(tag)) return null;
  const children = node.childNodes.map(renderDescriptionNode);

  if (tag === "a") {
    const href = node.attrs.find((attribute) => attribute.name === "href")?.value.trim() ?? "";
    try {
      const url = new URL(href);
      if (["https:", "http:", "mailto:"].includes(url.protocol)) {
        return <a key={key} href={url.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline dark:text-blue-400">{children}</a>;
      }
    } catch {
      // Keep the link's text when imported markup contains an invalid URL.
    }
    return <span key={key}>{children}</span>;
  }

  if (FORMATTING_TAGS.has(tag)) {
    return createElement(tag, { key }, tag === "br" ? undefined : children);
  }
  return <span key={key}>{children}</span>;
}

export function EventDescription({ description }: { description: string }) {
  const fragment = parseFragment(description);
  return (
    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
      {fragment.childNodes.map(renderDescriptionNode)}
    </div>
  );
}
