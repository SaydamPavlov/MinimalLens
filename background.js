let isCapturing = false;

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "capture-area") {
    if (isCapturing) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) return;

    if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://")) {
      return;
    }

    try {
      isCapturing = true;

      const screenshotUri = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });

      chrome.tabs.sendMessage(tab.id, {
        action: "START_SELECTION",
        screenshotUri: screenshotUri
      });
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => {
        isCapturing = false;
      }, 500);
    }
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_IMAGE") {
    handleVisionApi(request.base64Image)
      .then((text) => sendResponse({ success: true, text }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleVisionApi(base64Data) {
  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (!apiKey) {
    throw new Error("API-ключ не задан в настройках расширения.");
  }

  const cleanBase64 = base64Data.replace(/^data:image\/(png|jpeg);base64,/, "");
  const payload = {
    contents: [{
      parts: [
        { text: "Кратко опиши, переведи или реши то, что выделено на этом изображении. Ответ дай лаконично, без вводных фраз." },
        { inline_data: { mime_type: "image/png", data: cleanBase64 } }
      ]
    }]
  };

  const models = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-2.5-flash"
  ];

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.status === 503) {
          if (attempt === 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          } else {
            break;
          }
        }

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`Ошибка API (${res.status}): ${errorBody}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Ответ не получен.";
      } catch (err) {
        console.warn(`Ошибка модели ${model}:`, err.message);
      }
    }
  }

  throw new Error("Все серверы Gemini сейчас перегружены. Попробуйте еще раз через пару минут.");
}
