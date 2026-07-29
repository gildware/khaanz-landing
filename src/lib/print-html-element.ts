function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Copy styles from the current document so CSS-module class names still match. */
function collectDocumentStyles(): string {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
}

/**
 * Print a DOM subtree in an isolated frame so scroll/overflow locks on the
 * admin shell do not clip pages. Includes every child node, not just the viewport.
 */
export function printHtmlElement(element: HTMLElement, title: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("Print frame unavailable");
  }

  const styles = collectDocumentStyles();
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${styles}
<style>
  @page { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    height: auto;
    overflow: visible;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .recipe-book-preview-page {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
  }
</style>
</head>
<body>${element.innerHTML}</body>
</html>`);
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  win.onafterprint = cleanup;
  window.setTimeout(cleanup, 120_000);

  const trigger = () => {
    win.focus();
    win.print();
  };

  if (doc.readyState === "complete") {
    window.setTimeout(trigger, 250);
  } else {
    win.addEventListener("load", () => window.setTimeout(trigger, 250), {
      once: true,
    });
  }
}
