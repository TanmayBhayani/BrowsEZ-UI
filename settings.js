document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const domainsList = document.getElementById('domains-list');
  const newDomainInput = document.getElementById('new-domain');
  const addDomainBtn = document.getElementById('add-domain-btn');
  const backButton = document.getElementById('back-button');

  // Load active domains from storage
  loadActiveDomains();

  // Event listeners
  addDomainBtn.addEventListener('click', addDomain);
  newDomainInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addDomain();
    }
  });
  backButton.addEventListener('click', () => {
    window.close();
  });

  // Function to load active domains from storage
  function loadActiveDomains() {
    chrome.storage.local.get('activeDomains', data => {
      const domains = data.activeDomains || [];
      renderDomainsList(domains);
    });
  }

  // Function to render the domains list
  function renderDomainsList(domains) {
    domainsList.innerHTML = '';

    if (domains.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'No active domains. Add domains where the Find extension should be active.';
      domainsList.appendChild(emptyMessage);
      return;
    }

    domains.forEach(domain => {
      const domainItem = document.createElement('div');
      domainItem.className = 'domain-item';

      const domainText = document.createElement('span');
      domainText.className = 'domain-text';
      domainText.textContent = domain || '(Default)';

      const removeButton = document.createElement('button');
      removeButton.className = 'remove-domain';
      removeButton.innerHTML = '&times;';
      removeButton.title = 'Remove domain';
      removeButton.addEventListener('click', () => {
        removeDomain(domain);
      });

      domainItem.appendChild(domainText);
      domainItem.appendChild(removeButton);
      domainsList.appendChild(domainItem);
    });
  }

  // Function to add a new domain
  function addDomain() {
    const domain = newDomainInput.value.trim();
    
    if (!domain) {
      return;
    }

    // Basic domain validation
    if (!isValidDomain(domain)) {
      alert('Please enter a valid domain (e.g., example.com)');
      return;
    }

    chrome.storage.local.get('activeDomains', data => {
      const domains = data.activeDomains || [];
      
      if (domains.includes(domain)) {
        alert('This domain is already in the list');
        return;
      }
      
      domains.push(domain);
      chrome.storage.local.set({ activeDomains: domains }, () => {
        renderDomainsList(domains);
        newDomainInput.value = '';
      });
    });
  }

  // Function to remove a domain
  function removeDomain(domainToRemove) {
    if (confirm(`Are you sure you want to remove ${domainToRemove || '(Default)'}?`)) {
      chrome.storage.local.get('activeDomains', data => {
        const domains = data.activeDomains || [];
        const updatedDomains = domains.filter(domain => domain !== domainToRemove);
        
        chrome.storage.local.set({ activeDomains: updatedDomains }, () => {
          renderDomainsList(updatedDomains);
        });
      });
    }
  }

  // Basic domain validation
  function isValidDomain(domain) {
    // Allow simple domain format like example.com, sub.example.com
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }
}); 