(() => {
  const prompt = document.getElementById('photo-prompt');
  const status = document.getElementById('copy-status');
  const chatgpt = document.getElementById('chatgpt');
  const gemini = document.getElementById('gemini');
  function updateLink() {
    chatgpt.href = 'https://chatgpt.com/?q=' + encodeURIComponent(prompt.value.trim());
  }
  async function copyPrompt(destination) {
    try {
      await navigator.clipboard.writeText(prompt.value.trim());
      status.textContent = destination ? `Prompt copied. Paste it in ${destination}, attach your photo, then send.` : 'Prompt copied. Paste it into your chosen assistant and attach your photo.';
    } catch {
      document.getElementById('prompt-details').open = true;
      prompt.focus(); prompt.select();
      status.textContent = 'Automatic copying was unavailable. The prompt is selected below: copy it, then paste it in your assistant.';
    }
  }
  prompt.addEventListener('input', updateLink);
  document.getElementById('copy-prompt').addEventListener('click', () => copyPrompt());
  // Keep native new-tab navigation in the click gesture; no popup after an async wait.
  gemini.addEventListener('click', () => { void copyPrompt('Gemini'); });
  chatgpt.addEventListener('click', () => {
    updateLink();
    status.textContent = 'In ChatGPT, attach your photo before sending. If the prompt did not carry over, use Copy prompt.';
  });
  updateLink();
})();
