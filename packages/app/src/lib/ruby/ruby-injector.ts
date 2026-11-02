/**
 * Ruby Injector — injects pronunciation annotations into epub document DOM.
 *
 * Follows the same pattern as translation injection (injectChapterTranslations):
 * 1. Inject CSS styles once
 * 2. Walk text nodes in visible blocks
 * 3. Replace text nodes with ruby-annotated HTML
 * 4. Skip elements inside .readany-translation or existing <ruby> tags
 *
 * CFI/progress is NOT affected because <ruby> wraps inline around existing text —
 * the text content remains in the DOM tree at the same position.
 */

import type { RubyMode } from "@readany/core/stores/ruby-store";
import { annotateChinese, isPinyinDictLoaded, type RubyToken } from "./pinyin-processor";

const RUBY_STYLE_ID = "readany-ruby-annotation-style";
const RUBY_PROCESSED_ATTR = "data-ruby-processed";

/**
 * Inject ruby annotation CSS into the document (one-time).
 */
function injectRubyStyles(doc: Document): void {
  if (doc.getElementById(RUBY_STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = RUBY_STYLE_ID;
  style.textContent = `
    .readany-ruby rt {
      font-size: 0.5em;
      line-height: 1;
      color: var(--readany-ruby-color, #888);
      font-weight: normal;
      user-select: none;
      -webkit-user-select: none;
    }
    .readany-ruby {
      ruby-align: center;
    }
    /* Ensure ruby doesn't affect line height too much */
    .readany-ruby-container {
      ruby-position: over;
      -webkit-ruby-position: before;
    }
  `;
  doc.head?.appendChild(style);
}

/**
 * Extract original text from a ruby-processed span, excluding <rt>/<rp> content.
 * el.textContent would include the pronunciation text from <rt>, so we must
 * manually walk and skip those elements.
 */
function extractOriginalText(el: Element): string {
  let result = "";
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.nodeValue || "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName?.toLowerCase();
      if (tag === "rt" || tag === "rp") {
        // Skip pronunciation annotations
        continue;
      } else if (tag === "ruby") {
        // For <ruby>, extract only the base text (skip nested <rt>/<rp>)
        result += extractOriginalText(child as Element);
      } else {
        result += extractOriginalText(child as Element);
      }
    }
  }
  return result;
}

/**
 * Remove all ruby annotations from the document.
 */
export function removeRubyAnnotations(doc: Document): void {
  // Remove style
  doc.getElementById(RUBY_STYLE_ID)?.remove();

  // Find all ruby-processed elements and restore original text
  const processed = doc.querySelectorAll(`[${RUBY_PROCESSED_ATTR}]`);
  for (const el of processed) {
    // Extract just the base characters, excluding <rt>/<rp> pronunciation text
    const originalText = extractOriginalText(el);
    const textNode = doc.createTextNode(originalText);
    el.parentNode?.replaceChild(textNode, el);
  }
}

/**
 * Check if a node should be skipped (translation overlays, existing ruby, etc.)
 */
function shouldSkipElement(el: Element): boolean {
  if (el.closest(".readany-translation")) return true;
  if (el.closest("ruby")) return true;
  if (el.closest("rt")) return true;
  if (el.closest("rp")) return true;
  if (el.closest(`[${RUBY_PROCESSED_ATTR}]`)) return true;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return true;
  return false;
}

// CJK character detection (Unified Ideographs + Extension A + Compatibility)
const HAS_CJK = /[一-鿿㐀-䶿豈-﫿]/;

/**
 * Inject ruby annotations into visible blocks of the document.
 */
export function injectRubyAnnotations(
  doc: Document,
  mode: RubyMode,
  visibilityChecker?: (rect: DOMRect) => boolean,
): number {
  if (!mode) return 0;
  if (mode.startsWith("zh") && !isPinyinDictLoaded()) return 0;

  injectRubyStyles(doc);

  const blockSelector = "p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, div";
  const blocks = Array.from(doc.querySelectorAll(blockSelector)).filter((block) => {
    if (!block.textContent?.trim()) return false;
    if (shouldSkipElement(block)) return false;
    if (block.querySelector(`[${RUBY_PROCESSED_ATTR}]`)) return false;
    // Only process blocks with CJK characters
    if (!HAS_CJK.test(block.textContent)) return false;
    // Visibility check (optional — for lazy processing)
    if (visibilityChecker) {
      return visibilityChecker(block.getBoundingClientRect());
    }
    return true;
  });

  let annotatedCount = 0;

  for (const block of blocks) {
    // Walk text nodes within this block
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_SKIP;
        if (!HAS_CJK.test(node.nodeValue)) return NodeFilter.FILTER_SKIP;
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_ACCEPT;
        if (shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Text[] = [];
    let textNode = walker.nextNode() as Text | null;
    while (textNode) {
      textNodes.push(textNode);
      textNode = walker.nextNode() as Text | null;
    }

    for (const node of textNodes) {
      const text = node.nodeValue || "";
      if (!text.trim() || !HAS_CJK.test(text)) continue;

      let tokens: RubyToken[];
      if (mode === "zh-pinyin" || mode === "zh-zhuyin") {
        tokens = annotateChinese(text, mode === "zh-zhuyin" ? "zhuyin" : "pinyin");
      } else {
        // Japanese — TODO: implement with kuromoji
        continue;
      }

      // Build ruby HTML
      const span = doc.createElement("span");
      span.setAttribute(RUBY_PROCESSED_ATTR, "true");
      span.className = "readany-ruby-container";

      for (const token of tokens) {
        if (token.needsRuby && token.reading) {
          const ruby = doc.createElement("ruby");
          ruby.className = "readany-ruby";
          ruby.textContent = token.char;
          const rt = doc.createElement("rt");
          rt.textContent = token.reading;
          ruby.appendChild(rt);
          span.appendChild(ruby);
        } else {
          span.appendChild(doc.createTextNode(token.char));
        }
      }

      // Replace original text node with annotated span
      node.parentNode?.replaceChild(span, node);
      annotatedCount++;
    }
  }

  return annotatedCount;
}
