document.addEventListener("DOMContentLoaded", async () => {
  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (apiKey) {
    document.getElementById("apiKey").value = apiKey;
  }
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const apiKey = document.getElementById("apiKey").value.trim();
  chrome.storage.sync.set({ apiKey }, () => {
    const status = document.getElementById("status");
    status.innerText = "Сохранено!";
    setTimeout(() => {
      status.innerText = "";
    }, 2000);
  });
});