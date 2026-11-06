(() => {
  if (window.__minimalLensInitialized) return;
  window.__minimalLensInitialized = true;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "START_SELECTION") {
      initSelection(msg.screenshotUri);
    }
  });

  function initSelection(screenshotUri) {
    document.querySelectorAll(".minimal-lens-element").forEach((el) => el.remove());

    const overlay = document.createElement("div");
    overlay.className = "minimal-lens-element";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483646;
      cursor: crosshair;
      background: transparent;
      user-select: none;
    `;

    let startX = 0;
    let startY = 0;
    let box = null;
    let isDrawing = false;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        cleanup();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    overlay.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;

      box = document.createElement("div");
      box.className = "minimal-lens-element";
      box.style.cssText = `
        position: fixed;
        border: 1px solid #1a73e8;
        background: transparent;
        pointer-events: none;
        z-index: 2147483647;
      `;
      document.body.appendChild(box);
    });

    overlay.addEventListener("mousemove", (e) => {
      if (!isDrawing || !box) return;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
    });

    overlay.addEventListener("mouseup", async (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      window.removeEventListener("keydown", onKeyDown);
      overlay.remove();

      if (!box) return;

      const rect = box.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) {
        box.remove();
        return;
      }

      const tooltip = createTooltip(rect);
      tooltip.innerText = "Анализ...";

      try {
        const croppedBase64 = await cropImage(screenshotUri, rect);
        
        chrome.runtime.sendMessage(
          { action: "ANALYZE_IMAGE", base64Image: croppedBase64 },
          (response) => {
            if (response && response.success) {
              tooltip.innerText = response.text;
            } else {
              tooltip.innerText = `Ошибка: ${response?.error || "Неизвестная ошибка"}`;
            }
          }
        );
      } catch (err) {
        tooltip.innerText = `Ошибка: ${err.message}`;
      }
    });

    function cleanup() {
      window.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      if (box) box.remove();
    }

    document.body.appendChild(overlay);
  }

  function createTooltip(rect) {
    const tooltip = document.createElement("div");
    tooltip.className = "minimal-lens-element";
    tooltip.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.bottom + 6}px;
      max-width: 420px;
      max-height: 250px;
      overflow-y: auto;
      padding: 8px 12px;
      background: #ffffff;
      color: #1f1f1f;
      border: 1px solid #dadce0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.45;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      z-index: 2147483647;
      white-space: pre-wrap;
      word-break: break-word;
    `;

    tooltip.title = "Нажмите, чтобы закрыть";
    tooltip.style.cursor = "pointer";
    tooltip.addEventListener("click", () => {
      document.querySelectorAll(".minimal-lens-element").forEach((el) => el.remove());
    });

    document.body.appendChild(tooltip);
    return tooltip;
  }

  function cropImage(dataUri, rect) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        ctx.drawImage(
          img,
          rect.left * dpr,
          rect.top * dpr,
          rect.width * dpr,
          rect.height * dpr,
          0,
          0,
          canvas.width,
          canvas.height
        );

        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = dataUri;
    });
  }
})();
