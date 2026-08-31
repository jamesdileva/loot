const ELEMENT_IDS = [
  "task-list",
  "empty",
  "no-filter-match",
  "add-form",
  "title-input",
  "search-input",
  "status",
  "status-select",
  "due-select",
  "export-btn",
  "import-btn",
  "import-file",
];

function makeClassList(names) {
  return {
    add(...cs) {
      for (const c of cs) if (c) names.add(c);
    },
    remove(...cs) {
      for (const c of cs) names.delete(c);
    },
    toggle(n, force) {
      const want = force === undefined ? !names.has(n) : Boolean(force);
      if (want) names.add(n);
      else names.delete(n);
      return want;
    },
    contains(n) {
      return names.has(n);
    },
  };
}

function makeElement(tag) {
  const names = new Set();
  const attrs = new Map();
  const kids = [];
  const handlers = new Map();

  function matches(sel) {
    for (const raw of String(sel).split(",")) {
      const s = raw.trim();
      if (!s) continue;
      if (s.startsWith(".")) {
        if (names.has(s.slice(1))) return true;
      } else if (s.startsWith("[")) {
        const dataId = s.match(/^\[data-id="([^"]*)"\]$/);
        if (dataId) {
          if (el.dataset.id === dataId[1]) return true;
          continue;
        }
        const attr = s.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/);
        if (attr && (attrs.get(attr[1]) ?? "") === (attr[2] ?? "")) return true;
      } else if (el.tagName === s.trim().toUpperCase()) {
        return true;
      }
    }
    return false;
  }

  function querySelector(sel) {
    const stack = [...kids].reverse();
    while (stack.length) {
      const n = stack.pop();
      if (n.matches(sel)) return n;
      for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
    return null;
  }

  function append(...nodes) {
    for (const n of nodes) {
      if (n == null) continue;
      if (typeof n === "string" || typeof n === "number") {
        el.textContent += String(n);
        continue;
      }
      if (n._pp === el) continue;
      n._pp = el;
      kids.push(n);
    }
  }

  const el = {
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    checked: false,
    disabled: false,
    hidden: false,
    type: "",
    rows: 0,
    placeholder: "",
    href: "",
    download: "",
    files: null,
    required: false,
    matches,
    querySelector,
    append,
    appendChild: (...nodes) => append(...nodes),
    replaceChildren(...nodes) {
      for (const k of kids) k._pp = null;
      kids.length = 0;
      el.textContent = "";
      append(...nodes);
    },
    remove() {
      if (!el._pp) return;
      const idx = el._pp.children.indexOf(el);
      if (idx >= 0) el._pp.children.splice(idx, 1);
      el._pp = null;
    },
    insertBefore(node, ref) {
      if (node._pp === el) return;
      node._pp = el;
      if (!ref) {
        kids.push(node);
        return;
      }
      const idx = kids.indexOf(ref);
      kids.splice(idx < 0 ? kids.length : idx, 0, node);
    },
    setAttribute(n, v) {
      attrs.set(String(n), String(v));
    },
    removeAttribute(n) {
      attrs.delete(String(n));
    },
    getAttribute(n) {
      return attrs.get(String(n)) ?? null;
    },
    addEventListener(type, fn) {
      const set = handlers.get(type) || new Set();
      set.add(fn);
      handlers.set(type, set);
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn);
    },
    dispatch(type, event = {}) {
      const ev = { target: el, ...event };
      for (const fn of [...(handlers.get(type) || [])]) fn(ev);
    },
    click() {
      el.dispatch("click", { target: el });
    },
    focus() {},
    select() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, height: 0, width: 0 };
    },
    closest(sel) {
      let n = el;
      while (n) {
        if (n.matches(sel)) return n;
        n = n._pp;
      }
      return null;
    },
  };

  Object.defineProperties(el, {
    tagName: { enumerable: true, value: String(tag).toUpperCase() },
    nodeType: { enumerable: true, value: 1 },
    children: { enumerable: true, get: () => kids },
    childElementCount: { enumerable: true, get: () => kids.length },
    className: {
      enumerable: true,
      get: () => [...names].join(" "),
      set: (v) => {
        names.clear();
        for (const c of String(v).split(/\s+/)) if (c) names.add(c);
      },
    },
    classList: { enumerable: true, value: makeClassList(names) },
    _pp: { enumerable: false, writable: true, value: null },
    parentElement: { enumerable: false, get: () => el._pp },
  });

  return el;
}

export function createDom() {
  const byId = new Map();
  const elements = {};
  for (const id of ELEMENT_IDS) {
    let tag = "div";
    if (id === "task-list") tag = "ul";
    else if (id.endsWith("-form")) tag = "form";
    else if (id === "title-input" || id === "search-input") tag = "input";
    else if (id === "import-file") tag = "input";
    else if (id.endsWith("-select")) tag = "select";
    else if (id.endsWith("-btn")) tag = "button";
    else if (id === "status" || id === "empty" || id === "no-filter-match") tag = "p";
    elements[id] = makeElement(tag);
    byId.set(id, elements[id]);
  }
  const body = makeElement("body");
  return {
    document: {
      getElementById: (id) => byId.get(id) || null,
      createElement: (tag) => makeElement(tag),
      elementFromPoint: () => null,
      body,
    },
    elements,
  };
}