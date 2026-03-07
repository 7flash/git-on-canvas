// src/core/state.ts
class CanvasState {
  zoom = 1;
  offsetX = 0;
  offsetY = 0;
  viewportEl = null;
  contentEl = null;
  listeners = new Set;
  MIN_ZOOM = 0.05;
  MAX_ZOOM = 5;
  constructor(viewport, content) {
    this.viewportEl = viewport ?? null;
    this.contentEl = content ?? null;
  }
  bind(viewport, content) {
    this.viewportEl = viewport;
    this.contentEl = content;
    this.applyTransform();
  }
  snapshot() {
    return { zoom: this.zoom, offsetX: this.offsetX, offsetY: this.offsetY };
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify() {
    for (const fn of this.listeners)
      fn();
  }
  applyTransform() {
    if (!this.contentEl)
      return;
    this.contentEl.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
  }
  set(zoom, offsetX, offsetY) {
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.applyTransform();
    this.notify();
  }
  pan(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
    this.applyTransform();
    this.notify();
  }
  panTo(worldX, worldY) {
    if (!this.viewportEl)
      return;
    const vpW = this.viewportEl.clientWidth;
    const vpH = this.viewportEl.clientHeight;
    this.offsetX = vpW / 2 - worldX * this.zoom;
    this.offsetY = vpH / 2 - worldY * this.zoom;
    this.applyTransform();
    this.notify();
  }
  zoomToward(screenX, screenY, factor) {
    const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * factor));
    if (newZoom === this.zoom)
      return;
    const rect = this.viewportEl?.getBoundingClientRect();
    const mouseX = screenX - (rect?.left ?? 0);
    const mouseY = screenY - (rect?.top ?? 0);
    const worldX = (mouseX - this.offsetX) / this.zoom;
    const worldY = (mouseY - this.offsetY) / this.zoom;
    this.zoom = newZoom;
    this.offsetX = mouseX - worldX * newZoom;
    this.offsetY = mouseY - worldY * newZoom;
    this.applyTransform();
    this.notify();
  }
  screenToWorld(screenX, screenY) {
    const rect = this.viewportEl?.getBoundingClientRect();
    const localX = screenX - (rect?.left ?? 0);
    const localY = screenY - (rect?.top ?? 0);
    return {
      x: (localX - this.offsetX) / this.zoom,
      y: (localY - this.offsetY) / this.zoom
    };
  }
  worldToScreen(worldX, worldY) {
    const rect = this.viewportEl?.getBoundingClientRect();
    return {
      x: worldX * this.zoom + this.offsetX + (rect?.left ?? 0),
      y: worldY * this.zoom + this.offsetY + (rect?.top ?? 0)
    };
  }
  getVisibleWorldRect(margin = 0) {
    if (!this.viewportEl)
      return null;
    const vpW = this.viewportEl.clientWidth;
    const vpH = this.viewportEl.clientHeight;
    const left = (-this.offsetX - margin) / this.zoom;
    const top = (-this.offsetY - margin) / this.zoom;
    const right = (vpW - this.offsetX + margin) / this.zoom;
    const bottom = (vpH - this.offsetY + margin) / this.zoom;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  fitRect(worldLeft, worldTop, worldRight, worldBottom, padding = 60) {
    if (!this.viewportEl)
      return;
    const vpW = this.viewportEl.clientWidth;
    const vpH = this.viewportEl.clientHeight;
    const w = worldRight - worldLeft + padding * 2;
    const h = worldBottom - worldTop + padding * 2;
    const zoom = Math.min(vpW / w, vpH / h, this.MAX_ZOOM);
    this.set(zoom, (vpW - w * zoom) / 2 - (worldLeft - padding) * zoom, (vpH - h * zoom) / 2 - (worldTop - padding) * zoom);
  }
}

// src/core/cards.ts
var DEFAULT_OPTIONS = {
  defaultWidth: 400,
  defaultHeight: 300,
  minWidth: 200,
  minHeight: 150,
  gridSize: 0,
  cornerSize: 40
};

class CardManager {
  state;
  bus;
  canvas;
  cards = new Map;
  deferred = new Map;
  selected = new Set;
  topZ = 10;
  plugins = new Map;
  opts;
  constructor(state, bus, canvas, options) {
    this.state = state;
    this.bus = bus;
    this.canvas = canvas;
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }
  registerPlugin(plugin) {
    this.plugins.set(plugin.type, plugin);
  }
  create(type, data) {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      console.warn(`[galaxydraw] No plugin registered for card type "${type}"`);
      return null;
    }
    const full = {
      x: data.x ?? 0,
      y: data.y ?? 0,
      width: data.width ?? this.opts.defaultWidth,
      height: data.height ?? this.opts.defaultHeight,
      collapsed: data.collapsed ?? false,
      meta: data.meta ?? {},
      ...data
    };
    const el = plugin.render(full);
    el.classList.add("gd-card");
    el.dataset.cardId = full.id;
    el.dataset.cardType = type;
    el.style.left = `${full.x}px`;
    el.style.top = `${full.y}px`;
    el.style.width = `${full.width}px`;
    if (!full.collapsed) {
      el.style.height = `${full.height}px`;
    }
    this.canvas.appendChild(el);
    this.cards.set(full.id, el);
    this.bringToFront(el);
    this.setupDrag(el);
    this.setupResize(el, type);
    this.bus.emit("card:create", { id: full.id, x: full.x, y: full.y });
    return el;
  }
  remove(id) {
    const el = this.cards.get(id);
    if (!el) {
      this.deferred.delete(id);
      return;
    }
    const type = el.dataset.cardType;
    if (type) {
      this.plugins.get(type)?.onDestroy?.(el);
    }
    el.remove();
    this.cards.delete(id);
    this.selected.delete(id);
    this.bus.emit("card:remove", { id });
  }
  defer(type, data) {
    this.deferred.set(data.id, { ...data, plugin: type });
  }
  materializeInRect(worldRect) {
    let count = 0;
    const toRemove = [];
    for (const [id, entry] of this.deferred) {
      const { x, y, width, height, plugin } = entry;
      const w = width || this.opts.defaultWidth;
      const h = height || this.opts.defaultHeight;
      if (x + w > worldRect.left && x < worldRect.right && y + h > worldRect.top && y < worldRect.bottom) {
        if (plugin) {
          this.create(plugin, entry);
        }
        toRemove.push(id);
        count++;
      }
    }
    for (const id of toRemove) {
      this.deferred.delete(id);
    }
    return count;
  }
  clear() {
    for (const [id, el] of this.cards) {
      const type = el.dataset.cardType;
      if (type)
        this.plugins.get(type)?.onDestroy?.(el);
      el.remove();
    }
    this.cards.clear();
    this.deferred.clear();
    this.selected.clear();
  }
  bringToFront(el) {
    this.topZ++;
    el.style.zIndex = String(this.topZ);
  }
  select(id, multi = false) {
    if (!multi) {
      this.deselectAll();
    }
    this.selected.add(id);
    this.cards.get(id)?.classList.add("gd-card--selected");
    this.bus.emit("card:select", { ids: [...this.selected] });
  }
  deselect(id) {
    this.selected.delete(id);
    this.cards.get(id)?.classList.remove("gd-card--selected");
    this.bus.emit("card:deselect", { ids: [id] });
  }
  deselectAll() {
    for (const id of this.selected) {
      this.cards.get(id)?.classList.remove("gd-card--selected");
    }
    const prev = [...this.selected];
    this.selected.clear();
    if (prev.length > 0) {
      this.bus.emit("card:deselect", { ids: prev });
    }
  }
  toggleCollapse(id) {
    const el = this.cards.get(id);
    if (!el)
      return;
    const collapsed = el.classList.toggle("gd-card--collapsed");
    this.bus.emit("card:collapse", { id, collapsed });
  }
  setupDrag(card) {
    const header = card.querySelector(".gd-card-header");
    const handle = header || card;
    let dragging = false;
    let startWorldX = 0, startWorldY = 0;
    let cardStartX = 0, cardStartY = 0;
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0)
        return;
      if (header && e.target !== header && !header.contains(e.target))
        return;
      e.preventDefault();
      dragging = true;
      this.bringToFront(card);
      const world = this.state.screenToWorld(e.clientX, e.clientY);
      cardStartX = parseFloat(card.style.left) || 0;
      cardStartY = parseFloat(card.style.top) || 0;
      startWorldX = world.x;
      startWorldY = world.y;
      card.classList.add("gd-card--dragging");
      const onMove = (ev) => {
        if (!dragging)
          return;
        const curr = this.state.screenToWorld(ev.clientX, ev.clientY);
        let newX = cardStartX + (curr.x - startWorldX);
        let newY = cardStartY + (curr.y - startWorldY);
        if (this.opts.gridSize > 0 && ev.shiftKey) {
          newX = Math.round(newX / this.opts.gridSize) * this.opts.gridSize;
          newY = Math.round(newY / this.opts.gridSize) * this.opts.gridSize;
        }
        card.style.left = `${newX}px`;
        card.style.top = `${newY}px`;
      };
      const onUp = () => {
        dragging = false;
        card.classList.remove("gd-card--dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const x = parseFloat(card.style.left) || 0;
        const y = parseFloat(card.style.top) || 0;
        this.bus.emit("card:move", { id: card.dataset.cardId, x, y });
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
  setupResize(card, type) {
    const handle = document.createElement("div");
    handle.className = "gd-resize-handle";
    card.appendChild(handle);
    let resizing = false;
    let startW = 0, startH = 0, startX = 0, startY = 0;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      startW = card.offsetWidth;
      startH = card.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;
      card.classList.add("gd-card--resizing");
      const onMove = (ev) => {
        if (!resizing)
          return;
        const dw = (ev.clientX - startX) / this.state.zoom;
        const dh = (ev.clientY - startY) / this.state.zoom;
        const w = Math.max(this.opts.minWidth, startW + dw);
        const h = Math.max(this.opts.minHeight, startH + dh);
        card.style.width = `${w}px`;
        card.style.height = `${h}px`;
        this.plugins.get(type)?.onResize?.(card, w, h);
      };
      const onUp = () => {
        resizing = false;
        card.classList.remove("gd-card--resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        this.bus.emit("card:resize", {
          id: card.dataset.cardId,
          width: card.offsetWidth,
          height: card.offsetHeight
        });
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
  consumesWheel(target) {
    const card = target.closest(".gd-card");
    if (!card)
      return false;
    const type = card.dataset.cardType;
    if (!type)
      return false;
    return this.plugins.get(type)?.consumesWheel?.(target) ?? false;
  }
  consumesMouse(target) {
    const card = target.closest(".gd-card");
    if (!card)
      return false;
    const type = card.dataset.cardType;
    if (!type)
      return false;
    return this.plugins.get(type)?.consumesMouse?.(target) ?? false;
  }
}

// src/core/viewport.ts
class ViewportCuller {
  state;
  cards;
  bus;
  rafPending = false;
  enabled = true;
  margin = 500;
  constructor(state, cards, bus) {
    this.state = state;
    this.cards = cards;
    this.bus = bus;
  }
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  schedule() {
    if (this.rafPending || !this.enabled)
      return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.perform();
    });
  }
  perform() {
    const result = { shown: 0, culled: 0, materialized: 0, total: 0 };
    if (!this.enabled)
      return result;
    const worldRect = this.state.getVisibleWorldRect(this.margin);
    if (!worldRect)
      return result;
    for (const [id, card] of this.cards.cards) {
      const visible = this.isCardInRect(card, worldRect);
      const wasCulled = card.dataset.culled === "true";
      if (visible && wasCulled) {
        card.style.contentVisibility = "";
        card.style.visibility = "";
        card.dataset.culled = "false";
        result.shown++;
      } else if (!visible && !wasCulled) {
        card.style.contentVisibility = "hidden";
        card.style.visibility = "hidden";
        card.dataset.culled = "true";
        result.culled++;
      } else if (visible) {
        result.shown++;
      } else {
        result.culled++;
      }
    }
    if (this.cards.deferred.size > 0) {
      result.materialized = this.cards.materializeInRect(worldRect);
    }
    result.total = this.cards.cards.size + this.cards.deferred.size;
    if (result.materialized > 0) {
      this.bus.emit("viewport:cull", result);
    }
    return result;
  }
  uncullAll() {
    for (const [, card] of this.cards.cards) {
      card.style.contentVisibility = "";
      card.style.visibility = "";
      card.dataset.culled = "false";
    }
  }
  isCardInRect(card, rect) {
    const x = parseFloat(card.style.left) || 0;
    const y = parseFloat(card.style.top) || 0;
    const w = card.offsetWidth || 400;
    const h = card.offsetHeight || 300;
    return x + w > rect.left && x < rect.right && y + h > rect.top && y < rect.bottom;
  }
}

// src/core/events.ts
class EventBus {
  handlers = new Map;
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set);
    }
    this.handlers.get(event).add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }
  once(event, handler) {
    const wrapper = (data) => {
      unsub();
      handler(data);
    };
    const unsub = this.on(event, wrapper);
    return unsub;
  }
  emit(event, data) {
    const handlers = this.handlers.get(event);
    if (!handlers)
      return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[galaxydraw] Event handler error for "${event}":`, err);
      }
    }
  }
  off(event, handler) {
    if (handler) {
      this.handlers.get(event)?.delete(handler);
    } else {
      this.handlers.delete(event);
    }
  }
  clear() {
    this.handlers.clear();
  }
}

// src/core/engine.ts
class GalaxyDraw {
  state;
  cards;
  culler;
  bus;
  mode;
  viewport;
  canvas;
  spaceHeld = false;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  cleanupFns = [];
  touchStartX = 0;
  touchStartY = 0;
  lastPinchDist = 0;
  constructor(container, options) {
    this.mode = options?.mode ?? "simple";
    this.bus = new EventBus;
    this.viewport = document.createElement("div");
    this.viewport.className = `gd-viewport ${options?.className ?? ""}`.trim();
    this.viewport.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;";
    this.canvas = document.createElement("div");
    this.canvas.className = "gd-canvas";
    this.canvas.style.cssText = "position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;";
    this.viewport.appendChild(this.canvas);
    container.appendChild(this.viewport);
    this.state = new CanvasState;
    this.state.bind(this.viewport, this.canvas);
    this.cards = new CardManager(this.state, this.bus, this.canvas, options?.cards);
    this.culler = new ViewportCuller(this.state, this.cards, this.bus);
    if (options?.cullMargin)
      this.culler.margin = options.cullMargin;
    this.setupWheel();
    this.setupMouse();
    this.setupTouch();
    this.setupKeyboard();
    const unsub = this.state.subscribe(() => this.culler.schedule());
    this.cleanupFns.push(unsub);
  }
  setMode(mode) {
    this.mode = mode;
    this.bus.emit("mode:change", { mode });
  }
  getMode() {
    return this.mode;
  }
  registerPlugin(plugin) {
    this.cards.registerPlugin(plugin);
  }
  fitAll(padding = 60) {
    this.culler.uncullAll();
    if (this.cards.cards.size === 0)
      return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [, card] of this.cards.cards) {
      const x = parseFloat(card.style.left) || 0;
      const y = parseFloat(card.style.top) || 0;
      const w = card.offsetWidth || 400;
      const h = card.offsetHeight || 300;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    this.state.fitRect(minX, minY, maxX, maxY, padding);
  }
  getViewport() {
    return this.viewport;
  }
  getCanvas() {
    return this.canvas;
  }
  destroy() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.cards.clear();
    this.bus.clear();
    this.viewport.remove();
  }
  setupWheel() {
    this.viewport.addEventListener("wheel", (e) => {
      const target = e.target;
      if (this.cards.consumesWheel(target))
        return;
      const scrollBody = target.closest(".gd-card-body");
      if (scrollBody && scrollBody.scrollHeight > scrollBody.clientHeight) {
        const atTop = scrollBody.scrollTop <= 0 && e.deltaY < 0;
        const atBottom = scrollBody.scrollTop + scrollBody.clientHeight >= scrollBody.scrollHeight - 1 && e.deltaY > 0;
        if (!atTop && !atBottom)
          return;
      }
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      this.state.zoomToward(e.clientX, e.clientY, factor);
    }, { passive: false });
  }
  setupMouse() {
    this.viewport.addEventListener("mousedown", (e) => {
      const target = e.target;
      if (this.cards.consumesMouse(target))
        return;
      if (target.closest(".gd-card-header") || target.closest(".gd-resize-handle"))
        return;
      const card = target.closest(".gd-card");
      if (card && e.button === 0) {
        const id = card.dataset.cardId;
        if (id) {
          this.cards.bringToFront(card);
          this.cards.select(id, e.shiftKey);
        }
        if (this.mode === "advanced")
          return;
      }
      const shouldPan = e.button === 1 || this.mode === "simple" && e.button === 0 && !card || this.mode === "advanced" && this.spaceHeld;
      if (shouldPan) {
        this.isDragging = true;
        this.dragStartX = e.clientX - this.state.offsetX;
        this.dragStartY = e.clientY - this.state.offsetY;
        this.viewport.style.cursor = "grabbing";
        e.preventDefault();
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        this.state.set(this.state.zoom, e.clientX - this.dragStartX, e.clientY - this.dragStartY);
      }
    });
    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.viewport.style.cursor = "";
      }
    });
  }
  setupTouch() {
    const onTouchStart = (e) => {
      const target = e.touches[0]?.target;
      if (!target)
        return;
      if (this.cards.consumesMouse(target))
        return;
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const card = target.closest(".gd-card");
        const shouldPan = this.mode === "simple" && !card || this.mode === "advanced" && this.spaceHeld;
        if (shouldPan) {
          this.isDragging = true;
          this.touchStartX = touch.clientX - this.state.offsetX;
          this.touchStartY = touch.clientY - this.state.offsetY;
          e.preventDefault();
        }
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        e.preventDefault();
      }
    };
    const onTouchMove = (e) => {
      if (this.isDragging && e.touches.length === 1) {
        const touch = e.touches[0];
        this.state.set(this.state.zoom, touch.clientX - this.touchStartX, touch.clientY - this.touchStartY);
        e.preventDefault();
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (this.lastPinchDist > 0) {
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const factor = dist / this.lastPinchDist;
          this.state.zoomToward(midX, midY, factor);
        }
        this.lastPinchDist = dist;
        e.preventDefault();
      }
    };
    const onTouchEnd = () => {
      this.isDragging = false;
      this.lastPinchDist = 0;
    };
    this.viewport.addEventListener("touchstart", onTouchStart, { passive: false });
    this.viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    this.viewport.addEventListener("touchend", onTouchEnd);
    this.cleanupFns.push(() => {
      this.viewport.removeEventListener("touchstart", onTouchStart);
      this.viewport.removeEventListener("touchmove", onTouchMove);
      this.viewport.removeEventListener("touchend", onTouchEnd);
    });
  }
  setupKeyboard() {
    const onKeyDown = (e) => {
      if (e.code === "Space" && !e.repeat) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA")
          return;
        e.preventDefault();
        this.spaceHeld = true;
        this.viewport.classList.add("gd-space-pan");
      }
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") {
        this.spaceHeld = false;
        this.viewport.classList.remove("gd-space-pan");
        if (this.isDragging) {
          this.isDragging = false;
          this.viewport.style.cursor = "";
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.cleanupFns.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });
  }
}
// src/core/layout.ts
class LayoutManager {
  cards;
  bus;
  storagePrefix;
  saveTimer = null;
  debounceMs = 300;
  provider = null;
  constructor(cards, bus, storagePrefix = "galaxydraw") {
    this.cards = cards;
    this.bus = bus;
    this.storagePrefix = storagePrefix;
    this.bus.on("card:move", () => this.debounceSave());
    this.bus.on("card:resize", () => this.debounceSave());
  }
  setProvider(provider) {
    this.provider = provider;
  }
  async save(key) {
    const layouts = [];
    for (const [id, el] of this.cards.cards) {
      layouts.push({
        id,
        x: parseFloat(el.style.left) || 0,
        y: parseFloat(el.style.top) || 0,
        width: el.offsetWidth,
        height: el.offsetHeight,
        collapsed: el.classList.contains("gd-card--collapsed")
      });
    }
    const lsKey = `${this.storagePrefix}:layout:${key}`;
    try {
      localStorage.setItem(lsKey, JSON.stringify(layouts));
    } catch {}
    if (this.provider) {
      try {
        await this.provider.save(key, layouts);
      } catch (err) {
        console.warn("[galaxydraw] Layout save to provider failed:", err);
      }
    }
    this.bus.emit("layout:save", { layouts });
  }
  async load(key) {
    if (this.provider) {
      try {
        const remote = await this.provider.load(key);
        if (remote.length > 0)
          return remote;
      } catch {}
    }
    const lsKey = `${this.storagePrefix}:layout:${key}`;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw)
        return JSON.parse(raw);
    } catch {}
    return [];
  }
  apply(layouts) {
    const layoutMap = new Map(layouts.map((l) => [l.id, l]));
    for (const [id, el] of this.cards.cards) {
      const layout = layoutMap.get(id);
      if (!layout)
        continue;
      el.style.left = `${layout.x}px`;
      el.style.top = `${layout.y}px`;
      el.style.width = `${layout.width}px`;
      el.style.height = `${layout.height}px`;
      if (layout.collapsed) {
        el.classList.add("gd-card--collapsed");
      }
    }
    this.bus.emit("layout:restore", { layouts });
  }
  reset(key) {
    const lsKey = `${this.storagePrefix}:layout:${key}`;
    try {
      localStorage.removeItem(lsKey);
    } catch {}
    this.bus.emit("layout:reset", {});
  }
  _currentKey = "";
  setCurrentKey(key) {
    this._currentKey = key;
  }
  debounceSave() {
    if (!this._currentKey)
      return;
    if (this.saveTimer)
      clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.save(this._currentKey);
    }, this.debounceMs);
  }
}
// src/core/minimap.ts
class Minimap {
  state;
  cards;
  el;
  mapCanvas;
  ctx2d;
  rafPending = false;
  width = 180;
  height = 120;
  constructor(state, cards, container) {
    this.state = state;
    this.cards = cards;
    this.el = document.createElement("div");
    this.el.className = "gd-minimap";
    this.el.style.cssText = `
            position: absolute;
            bottom: 12px;
            right: 12px;
            width: ${this.width}px;
            height: ${this.height}px;
            border-radius: 8px;
            overflow: hidden;
            backdrop-filter: blur(12px);
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
            cursor: pointer;
            z-index: 999;
        `;
    this.mapCanvas = document.createElement("canvas");
    this.mapCanvas.width = this.width;
    this.mapCanvas.height = this.height;
    this.el.appendChild(this.mapCanvas);
    container.appendChild(this.el);
    this.ctx2d = this.mapCanvas.getContext("2d");
    this.el.addEventListener("mousedown", (e) => this.handleClick(e));
    this.state.subscribe(() => this.scheduleRebuild());
  }
  scheduleRebuild() {
    if (this.rafPending)
      return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.rebuild();
    });
  }
  rebuild() {
    const ctx = this.ctx2d;
    if (!ctx)
      return;
    ctx.clearRect(0, 0, this.width, this.height);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [, card] of this.cards.cards) {
      const x = parseFloat(card.style.left) || 0;
      const y = parseFloat(card.style.top) || 0;
      const w = card.offsetWidth || 400;
      const h = card.offsetHeight || 300;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    for (const [, data] of this.cards.deferred) {
      minX = Math.min(minX, data.x);
      minY = Math.min(minY, data.y);
      maxX = Math.max(maxX, data.x + data.width);
      maxY = Math.max(maxY, data.y + data.height);
    }
    if (minX === Infinity)
      return;
    const pad = 50;
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const scale = Math.min(this.width / worldW, this.height / worldH);
    const ox = (this.width - worldW * scale) / 2;
    const oy = (this.height - worldH * scale) / 2;
    ctx.fillStyle = "rgba(147, 130, 255, 0.6)";
    for (const [, card] of this.cards.cards) {
      const x = (parseFloat(card.style.left) || 0) - minX + pad;
      const y = (parseFloat(card.style.top) || 0) - minY + pad;
      const w = card.offsetWidth || 400;
      const h = card.offsetHeight || 300;
      ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(2, w * scale), Math.max(2, h * scale));
    }
    ctx.fillStyle = "rgba(147, 130, 255, 0.2)";
    for (const [, data] of this.cards.deferred) {
      const x = data.x - minX + pad;
      const y = data.y - minY + pad;
      ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(2, data.width * scale), Math.max(2, data.height * scale));
    }
    const vp = this.state.getVisibleWorldRect();
    if (vp) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1.5;
      const rx = ox + (vp.left - minX + pad) * scale;
      const ry = oy + (vp.top - minY + pad) * scale;
      const rw = vp.width * scale;
      const rh = vp.height * scale;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }
  handleClick(e) {
    e.stopPropagation();
    e.preventDefault();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [, card] of this.cards.cards) {
      const x = parseFloat(card.style.left) || 0;
      const y = parseFloat(card.style.top) || 0;
      const w = card.offsetWidth || 400;
      const h = card.offsetHeight || 300;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    for (const [, data] of this.cards.deferred) {
      minX = Math.min(minX, data.x);
      minY = Math.min(minY, data.y);
      maxX = Math.max(maxX, data.x + data.width);
      maxY = Math.max(maxY, data.y + data.height);
    }
    if (minX === Infinity)
      return;
    const pad = 50;
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const scale = Math.min(this.width / worldW, this.height / worldH);
    const ox = (this.width - worldW * scale) / 2;
    const oy = (this.height - worldH * scale) / 2;
    const rect = this.el.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const worldX = (clickX - ox) / scale + minX - pad;
    const worldY = (clickY - oy) / scale + minY - pad;
    const vp = this.state.getVisibleWorldRect();
    if (vp) {
      const vpWorldW = vp.width;
      const vpWorldH = vp.height;
      const newOffsetX = -(worldX - vpWorldW / 2) * this.state.zoom;
      const newOffsetY = -(worldY - vpWorldH / 2) * this.state.zoom;
      this.state.set(this.state.zoom, newOffsetX, newOffsetY);
    }
    const onMove = (ev) => {
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const wx = (mx - ox) / scale + minX - pad;
      const wy = (my - oy) / scale + minY - pad;
      const v = this.state.getVisibleWorldRect();
      if (v) {
        this.state.set(this.state.zoom, -(wx - v.width / 2) * this.state.zoom, -(wy - v.height / 2) * this.state.zoom);
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  setVisible(visible) {
    this.el.style.display = visible ? "" : "none";
  }
  destroy() {
    this.el.remove();
  }
}
export {
  ViewportCuller,
  Minimap,
  LayoutManager,
  GalaxyDraw,
  EventBus,
  CardManager,
  CanvasState
};

//# debugId=7F71EC087A884FA064756E2164756E21
