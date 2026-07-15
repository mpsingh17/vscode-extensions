import type {
  ExtensionMessage,
  HeadingInfo,
  RenderPayload,
  WebviewMessage,
} from "../shared/messages";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

(function main() {
  const vscode = acquireVsCodeApi();

  const appEl = document.getElementById("app") as HTMLDivElement;
  const readerEl = document.getElementById("reader") as HTMLElement;
  const contentEl = document.getElementById("content") as HTMLDivElement;
  const tocListEl = document.getElementById("toc-list") as HTMLOListElement;
  const tocToggleEl = document.getElementById(
    "toc-toggle",
  ) as HTMLButtonElement;

  let headings: HeadingInfo[] = [];
  let activeSlug: string | null = null;
  let userToggledToc = false;
  let scrollTicking = false;

  function setTocCollapsed(collapsed: boolean): void {
    appEl.classList.toggle("toc-collapsed", collapsed);
    tocToggleEl.setAttribute("aria-expanded", String(!collapsed));
    tocToggleEl.setAttribute(
      "aria-label",
      collapsed ? "Expand table of contents" : "Collapse table of contents",
    );
  }

  tocToggleEl.addEventListener("click", () => {
    userToggledToc = true;
    const collapsed = !appEl.classList.contains("toc-collapsed");
    setTocCollapsed(collapsed);
    vscode.postMessage({ type: "tocCollapsed", collapsed });
  });

  function renderState(state: "noActiveFile" | "nonMarkdown"): void {
    appEl.dataset.state = state;
    tocListEl.innerHTML = "";
    headings = [];
    const message =
      state === "noActiveFile"
        ? 'Open a Markdown file, then run "Markdown Reader: Open Preview" again.'
        : "Focus a Markdown file to preview it here.";
    contentEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "placeholder";
    p.textContent = message;
    contentEl.appendChild(p);
  }

  function renderPayload(payload: RenderPayload): void {
    appEl.dataset.state = "ready";
    document.documentElement.style.setProperty(
      "--content-width",
      `${payload.settings.contentWidth}px`,
    );
    document.documentElement.style.setProperty(
      "--font-size",
      `${payload.settings.fontSize}px`,
    );

    const previousScrollTop = readerEl.scrollTop;

    if (payload.isEmpty) {
      contentEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "placeholder";
      p.textContent = "This file is empty.";
      contentEl.appendChild(p);
    } else {
      contentEl.innerHTML = payload.html;
      wrapWideTables();
    }

    headings = payload.headings;
    renderToc(headings);

    if (!userToggledToc) {
      setTocCollapsed(payload.tocCollapsed);
    }

    interceptLinks();

    readerEl.scrollTop = payload.resetScroll
      ? 0
      : Math.min(previousScrollTop, readerEl.scrollHeight);
    activeSlug = null;
    updateActiveHeading();
  }

  function wrapWideTables(): void {
    contentEl.querySelectorAll("table").forEach((table) => {
      if (table.parentElement?.classList.contains("table-scroll")) {
        return;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "table-scroll";
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });
  }

  function renderToc(items: HeadingInfo[]): void {
    tocListEl.innerHTML = "";
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "toc-empty";
      li.textContent = "No headings found";
      tocListEl.appendChild(li);
      return;
    }
    for (const heading of items) {
      const li = document.createElement("li");
      li.className = "toc-item";
      li.style.setProperty("--level", String(heading.level - 1));
      const a = document.createElement("a");
      a.href = `#${heading.slug}`;
      a.textContent = heading.text;
      a.dataset.slug = heading.slug;
      li.appendChild(a);
      tocListEl.appendChild(li);
    }
  }

  tocListEl.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[data-slug]",
    );
    if (!target?.dataset.slug) {
      return;
    }
    event.preventDefault();
    navigateToSlug(target.dataset.slug);
  });

  tocListEl.addEventListener("keydown", (event) => {
    const items = Array.from(
      tocListEl.querySelectorAll<HTMLAnchorElement>("a[data-slug]"),
    );
    const index = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === " ") {
      event.preventDefault();
      (document.activeElement as HTMLElement | null)?.click();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[Math.min(index + 1, items.length - 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[Math.max(index - 1, 0)]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  });

  function navigateToSlug(slug: string): void {
    const heading = contentEl.querySelector(`#${CSS.escape(slug)}`);
    heading?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateActiveHeading(): void {
    if (headings.length === 0) {
      return;
    }
    const threshold = readerEl.getBoundingClientRect().top + 80;
    let current = headings[0].slug;
    for (const heading of headings) {
      const el = contentEl.querySelector(`#${CSS.escape(heading.slug)}`);
      if (!el) {
        continue;
      }
      if (el.getBoundingClientRect().top <= threshold) {
        current = heading.slug;
      } else {
        break;
      }
    }
    if (current === activeSlug) {
      return;
    }
    activeSlug = current;
    tocListEl
      .querySelectorAll<HTMLAnchorElement>("a[data-slug]")
      .forEach((a) => {
        const isActive = a.dataset.slug === current;
        a.classList.toggle("active", isActive);
        if (isActive) {
          a.setAttribute("aria-current", "location");
          a.scrollIntoView({ block: "nearest" });
        } else {
          a.removeAttribute("aria-current");
        }
      });
  }

  readerEl.addEventListener("scroll", () => {
    if (scrollTicking) {
      return;
    }
    scrollTicking = true;
    requestAnimationFrame(() => {
      updateActiveHeading();
      scrollTicking = false;
    });
  });

  function interceptLinks(): void {
    contentEl.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      a.addEventListener("click", (event) => {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("#")) {
          return; // Let the browser handle in-document anchors.
        }
        event.preventDefault();
        if (/^https?:\/\//i.test(href)) {
          vscode.postMessage({ type: "openExternal", href });
        }
      });
    });
  }

  window.addEventListener(
    "message",
    (event: MessageEvent<ExtensionMessage>) => {
      const message = event.data;
      if (message.type === "render") {
        renderPayload(message.payload);
      } else if (message.type === "state") {
        renderState(message.state);
      }
    },
  );

  vscode.postMessage({ type: "ready" });
})();
