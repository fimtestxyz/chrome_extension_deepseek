const DEFAULT_TEMPLATES = {
  "Technical Dive": [
    "Can you provide specific examples or implementation details?",
    "What are the best practices and common pitfalls?",
    "What are the key recommendations and next steps?"
  ],
  "Broad Exploration": [
    "What are the related concepts or alternative approaches I should know about?",
    "How does this fit into the larger context of the field?",
    "What are the most controversial or debated aspects of this topic?"
  ]
};

const setsContainer = document.getElementById('sets-container');
const addSetBtn = document.getElementById('add-set-btn');
const saveBtn = document.getElementById('save-btn');
const themeToggle = document.getElementById('theme-toggle');

function createSetUI(name, queries) {
  const div = document.createElement('div');
  div.className = 'template-set';
  div.draggable = true;

  // Set Drag and Drop
  div.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', 'set');
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));

  const header = document.createElement('div');
  header.className = 'set-header';
  
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'set-name-input';
  nameInput.value = name;
  
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.onclick = () => div.remove();
  
  header.appendChild(nameInput);
  header.appendChild(deleteBtn);
  div.appendChild(header);
  
  const queriesDiv = document.createElement('div');
  queriesDiv.className = 'queries-list';
  
  function createQueryRow(text = '') {
    const row = document.createElement('div');
    row.className = 'query-row';
    row.draggable = true;

    row.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', 'query');
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));

    row.innerHTML = `
      <span class="drag-handle">☰</span>
      <label>Step:</label>
      <input type="text" class="query-input" value="${text}">
      <button class="btn btn-danger remove-query">×</button>
    `;
    row.querySelector('.remove-query').onclick = () => row.remove();
    return row;
  }

  queries.forEach(q => queriesDiv.appendChild(createQueryRow(q)));
  
  const addQueryBtn = document.createElement('button');
  addQueryBtn.textContent = '+ Add Question';
  addQueryBtn.className = 'btn btn-secondary';
  addQueryBtn.style.fontSize = '12px';
  addQueryBtn.onclick = () => queriesDiv.appendChild(createQueryRow());
  
  div.appendChild(queriesDiv);
  div.appendChild(addQueryBtn);
  
  return div;
}

// Reordering Logic
setsContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
  const dragging = document.querySelector('.dragging');
  if (!dragging) return;

  const type = e.dataTransfer.getData('text/plain');
  
  if (type === 'set') {
    const afterElement = getDragAfterElement(setsContainer, e.clientY, '.template-set');
    if (afterElement == null) {
      setsContainer.appendChild(dragging);
    } else {
      setsContainer.insertBefore(dragging, afterElement);
    }
  } else if (type === 'query') {
    const list = dragging.closest('.queries-list');
    if (!list) return;
    
    const afterElement = getDragAfterElement(list, e.clientY, '.query-row');
    if (afterElement == null) {
      list.appendChild(dragging);
    } else {
      list.insertBefore(dragging, afterElement);
    }
  }
});

function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveSettings() {
  const sets = {};
  const setElements = document.querySelectorAll('.template-set');
  
  setElements.forEach(el => {
    const name = el.querySelector('.set-name-input').value.trim();
    const inputs = el.querySelectorAll('.query-input');
    const queries = Array.from(inputs).map(input => input.value.trim());
    
    if (name && queries.length > 0) {
      sets[name] = queries;
    }
  });

  await chrome.storage.sync.set({ nextQuerySets: sets });
  saveBtn.textContent = 'Saved!';
  setTimeout(() => saveBtn.textContent = 'Save All Sets', 2000);
}

async function init() {
  // Theme
  const theme = await chrome.storage.sync.get('theme');
  if (theme.theme === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.checked = true;
  }

  themeToggle.onchange = async () => {
    const isDark = themeToggle.checked;
    document.body.classList.toggle('dark-mode', isDark);
    await chrome.storage.sync.set({ theme: isDark ? 'dark' : 'light' });
  };

  // Data
  const data = await chrome.storage.sync.get('nextQuerySets');
  let sets = data.nextQuerySets;

  if (!sets || Object.keys(sets).length === 0) {
    sets = DEFAULT_TEMPLATES;
  }

  Object.entries(sets).forEach(([name, queries]) => {
    setsContainer.appendChild(createSetUI(name, queries));
  });
}

addSetBtn.onclick = () => {
  setsContainer.appendChild(createSetUI('New Set', ['Question 1']));
};

saveBtn.onclick = saveSettings;
init();
