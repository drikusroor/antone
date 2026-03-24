let activeTab = null;
let onTabChange = null;

export function initTabs(changeCallback) {
  onTabChange = changeCallback;
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      const wasActive = btn.classList.contains('active');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      if (wasActive) {
        const prev = activeTab;
        activeTab = null;
        if (onTabChange) onTabChange(null, prev);
      } else {
        btn.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
        const prev = activeTab;
        activeTab = tabId;
        if (onTabChange) onTabChange(tabId, prev);
      }
    });
  });
}

export function getActiveTab() {
  return activeTab;
}
