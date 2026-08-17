const card = document.getElementById('card');
const statusText = document.getElementById('statusText');
const statusSub = document.getElementById('statusSub');
const toggleBtn = document.getElementById('toggleBtn');

function setUI(active) {
  card.className = 'status-card ' + (active ? 'on' : 'off');
  statusText.textContent = active ? 'Ativo' : 'Desativado';
  statusSub.textContent = active
    ? 'Legendas em português (pt-BR)'
    : 'Clique para ativar a tradução';
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    setUI(res.active);
  });
});


toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      const next = !res.active;
      chrome.tabs.sendMessage(tab.id, { action: next ? 'activate' : 'deactivate' }, () => {
        setUI(next);
      });
    });
  });
});
